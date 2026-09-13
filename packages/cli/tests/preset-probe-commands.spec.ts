/**
 * preset-probe-commands.spec.ts —— 预设只读探测器三件套命令面（W5 核心切片；
 * 裁决 20⑥ 追认方案落地：预设值保持 governed 原地，ToolBinding 面零注册——
 * 三探测器走独立只读 inspect/声明域命令面 `pomaster preset preview|drift|applicability`）。
 *
 * 研究锚：.trellis/tasks/09-12-long-horizon-impl-campaign/research/presets-as-tools.md
 * §2.2(b)（三件套 = 预览 diff / 漂移检测 / 适配分析）+ §5 红线对照（逐条钉面）。
 *
 * 钉面：
 * - 词形闸（红线 6 封闭面）：family 闭包 = 2 wired + 5 扩展位（SP 提案待追认）；
 *   词表外 PRESET_FAMILY_UNKNOWN fail-closed；lane 适用域闸 PRESET_LANE_INVALID；
 * - design-tokens 族（族 4）：preview 全对账/覆写预告/create 缺席态/损坏 fail-closed；
 *   drift 对齐/VALUE_DRIFT 指名/unanchored 披露/空分母 no_comparison（红线 10
 *   blindspot——禁「没查就报干净」）；applicability 栈匹配三值词形
 *   native|mismatch|unresolved（红线 5 advisory + 红线 11 值值有出处注记）；
 * - baseline-framework 族（族 1）：preview 14 键 fill/overwrite + lane 门态预告
 *   （ADR-1/ADR-4 只读镜像）；drift 未选型 = 空对账分母显式 / 异值 = VALUE_DRIFT
 *   （漂移≠违规注记——Owner 选型合法）；applicability lane/face/overlay 覆盖声明
 *   （包内 overlay 资产在座性——缺席诚实，红线 11 对照基准可溯）；
 * - 红线钉：纯读零写入（盘面字节快照前后恒等 + 未初始化目录零 .pomaster 创建；
 *   write_surface:"none" 结构级钉）；探测≠写授权（overwrite 条目 governed_path 指向
 *   baseline set --change / customize 确认链通路——非直写授权）；
 * - runCli 注册面：信封 command 词形 / 缺 --family requiredOption 闸 / exit 码。
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CHECKLIST_KEYS,
  collectStackAnswers,
  runBaselineConfirm,
  runBaselineSet,
  runCli,
  runInit,
  runPresetApplicability,
  runPresetDrift,
  runPresetPreview,
  type ChecklistIo,
  type PresetApplicabilityResult,
  type PresetDriftResult,
  type PresetPreviewResult,
} from "@pomaster/cli";
import {
  PRESET_FAMILY_EXTENSION_SLOTS,
  PRESET_FAMILY_WIRED,
} from "../src/preset-probe.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-preset-probe-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const TOKENS_TARGET = ".pomaster/baseline/frontend/design-tokens.yaml";

function read(relative: string): string {
  return readFileSync(join(dir, relative), "utf8");
}

/** 非 TTY init（播种全套 + stack UNKNOWN——design-tokens seed 同步在座）。 */
async function freshInit(): Promise<void> {
  const outcome = await runInit(dir, { platforms: "claude" });
  expect(outcome.ok).toBe(true);
}

/** scripted raw 问卷 io（baseline-preset.spec 同款）：预录按键序列驱动。 */
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

/** TTY 全流程 init（14 键全选首位 = R-E 实战栈）+ baseline confirm 烙印。 */
async function fullQuizInitAndConfirm(): Promise<void> {
  const { io } = scriptedRawIo(
    Array.from({ length: 14 }, () => CHECKLIST_KEYS.confirm),
  );
  const quiz = await collectStackAnswers(dir, io);
  expect(quiz).not.toBeNull();
  const outcome = await runInit(dir, { platforms: "claude", stackQuestionnaire: quiz ?? undefined });
  expect(outcome.ok).toBe(true);
  const confirmed = await runBaselineConfirm(dir, {});
  expect(confirmed.ok).toBe(true);
}

/** 手改一个 preset token 值（color.brand.primary——seed 同字段在座）。 */
function modifyTokenPrimary(): void {
  const text = read(TOKENS_TARGET);
  const modified = text.replace('primary: "#1677ff"', 'primary: "#00ff00"');
  expect(modified).not.toBe(text);
  writeFileSync(join(dir, TOKENS_TARGET), modified, "utf8");
}

/** .pomaster 全树字节快照（相对 POSIX 路径 → 字节；纯读零写入钉）。 */
function snapshotStore(): Map<string, Buffer> {
  const root = join(dir, ".pomaster");
  const out = new Map<string, Buffer>();
  if (!existsSync(root)) return out;
  const walk = (absolute: string, relative: string): void => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const childAbsolute = join(absolute, entry.name);
      const childRelative = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(childAbsolute, childRelative);
      } else {
        out.set(childRelative, readFileSync(childAbsolute));
      }
    }
  };
  walk(root, ".pomaster");
  return out;
}

// ============================================================
// A 段：家族注册面与词形闸（红线 6 封闭面 + 扩展位登记）
// ============================================================

describe("preset 家族注册面（2 wired + 5 扩展位）", () => {
  it("wired 闭包 = design-tokens + baseline-framework；扩展位 = 5 族登记（研究 §1.4 盘点对账）", () => {
    expect([...PRESET_FAMILY_WIRED]).toEqual(["design-tokens", "baseline-framework"]);
    expect(PRESET_FAMILY_EXTENSION_SLOTS.map((slot) => slot.family)).toEqual([
      "baseline-preset-draft",
      "technology-profile",
      "archetype-cards",
      "family-examples",
      "projection-presets",
    ]);
    for (const slot of PRESET_FAMILY_EXTENSION_SLOTS) {
      expect(slot.covers).toContain("族");
    }
  });

  it("family 词表外 → PRESET_FAMILY_UNKNOWN fail-closed（hint 列 wired + 扩展位全闭包）", async () => {
    const outcome = await runPresetPreview(dir, { family: "storybook-presets" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("PRESET_FAMILY_UNKNOWN");
    expect(outcome.errors[0]?.message).toContain("storybook-presets");
    const hint = outcome.errors[0]?.hint ?? "";
    for (const family of PRESET_FAMILY_WIRED) expect(hint).toContain(family);
    for (const slot of PRESET_FAMILY_EXTENSION_SLOTS) expect(hint).toContain(slot.family);
  });

  it("design-tokens 族 + --lane backend → PRESET_LANE_INVALID（适用域闸——族 4 恒 frontend）", async () => {
    const outcome = await runPresetPreview(dir, { family: "design-tokens", lane: "backend" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("PRESET_LANE_INVALID");
    expect(outcome.errors[0]?.message).toContain("frontend");
  });

  it("framework 族 + lane 词形外 → PRESET_LANE_INVALID（BASELINE_LANES 闭包闸）", async () => {
    const outcome = await runPresetDrift(dir, { family: "baseline-framework", lane: "mobile" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("PRESET_LANE_INVALID");
  });
});

// ============================================================
// B 段：design-tokens 族 · 预览 diff（族 4）
// ============================================================

describe("preset preview --family design-tokens（预览 diff——若应用该预设将改变什么）", () => {
  it("fresh init（盘面 = seed 原样）→ 全 compared 条目 action=none + 分母完整披露 + write_surface=none", async () => {
    await freshInit();
    const outcome = await runPresetPreview(dir, { family: "design-tokens" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetPreviewResult;
    expect(result.family).toBe("design-tokens");
    expect(result.lane).toBe("frontend");
    expect(result.write_surface).toBe("none");
    expect(result.target_face).toBe("baseline/frontend/design-tokens.yaml");
    // 分母纪律：entries = 非 UNKNOWN preset 键；skipped_preset_unknown 显式。
    expect(result.denominator.total).toBe(
      result.entries.length + result.denominator.skipped_preset_unknown,
    );
    expect(result.denominator.skipped_preset_unknown).toBeGreaterThanOrEqual(10); // 宁缺毋假 UNKNOWN 键在座
    expect(result.denominator.compared).toBe(result.entries.length);
    expect(result.target_face).toContain("design-tokens");
    for (const entry of result.entries) {
      expect(entry.action_if_applied).toBe("none");
      expect(entry.governed_path).toBeNull();
    }
    expect(result.entries.map((entry) => entry.key)).toContain("color.brand.primary");
    // advisory 红线 5：preset 值不呈现为项目事实。
    expect(result.notes.join("\n")).toContain("advisory");
  });

  it("fresh init（未确认）手改一值 → overwrite 条目 + governed_path 指确认链通路 + chain_effects 提烙印", async () => {
    await freshInit();
    modifyTokenPrimary();
    const outcome = await runPresetPreview(dir, { family: "design-tokens" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetPreviewResult;
    const entry = result.entries.find((item) => item.key === "color.brand.primary");
    expect(entry?.action_if_applied).toBe("overwrite");
    expect(entry?.preset_value).toBe("#1677ff");
    expect(entry?.current_value).toBe("#00ff00");
    expect(entry?.governed_path).toContain("customize");
    expect(result.denominator.compared).toBe(result.entries.length);
    expect(result.chain_effects.join("\n")).toContain("烙印");
  });

  it("确认态在座（drifted）→ chain_effects 提 BASELINE_DRIFT（探测≠写授权——红线 4）", async () => {
    await fullQuizInitAndConfirm();
    modifyTokenPrimary();
    const outcome = await runPresetPreview(dir, { family: "design-tokens" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetPreviewResult;
    expect(result.chain_effects.join("\n")).toContain("BASELINE_DRIFT");
    const entry = result.entries.find((item) => item.key === "color.brand.primary");
    expect(entry?.action_if_applied).toBe("overwrite");
  });

  it("盘面 design-tokens 缺席 → 全 preset 值键 action=create + current_value=null + compared=0", async () => {
    await freshInit();
    unlinkSync(join(dir, TOKENS_TARGET));
    const outcome = await runPresetPreview(dir, { family: "design-tokens" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetPreviewResult;
    expect(result.denominator.compared).toBe(0);
    expect(result.entries.length).toBeGreaterThan(0);
    for (const entry of result.entries) {
      expect(entry.action_if_applied).toBe("create");
      expect(entry.current_value).toBeNull();
    }
  });

  it("盘面 design-tokens 损坏 → SCHEMA_INVALID fail-closed（坏合同≠无合同——禁静默当空表）", async () => {
    await freshInit();
    writeFileSync(join(dir, TOKENS_TARGET), "meta: [broken\n", "utf8");
    const outcome = await runPresetPreview(dir, { family: "design-tokens" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("design-tokens");
  });
});

// ============================================================
// C 段：design-tokens 族 · 漂移检测（族 4）
// ============================================================

describe("preset drift --family design-tokens（漂移检测——当前值 vs 预设基准对账）", () => {
  it("fresh init → verdict=aligned + confirm_state=unconfirmed + 漂移≠违规注记", async () => {
    await freshInit();
    const outcome = await runPresetDrift(dir, { family: "design-tokens" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetDriftResult;
    expect(result.verdict).toBe("aligned");
    expect(result.write_surface).toBe("none");
    expect(result.drift_items).toEqual([]);
    expect(result.confirm_state).toBe("unconfirmed");
    expect(result.denominator.compared).toBeGreaterThan(0);
    expect(result.notes.join("\n")).toContain("漂移");
    expect(result.notes.join("\n")).toContain("违规");
  });

  it("手改一值 → VALUE_DRIFT 指名键 + verdict=drifted + confirm_state=drifted（已确认盘面）", async () => {
    await fullQuizInitAndConfirm();
    modifyTokenPrimary();
    const outcome = await runPresetDrift(dir, { family: "design-tokens" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetDriftResult;
    expect(result.verdict).toBe("drifted");
    expect(result.confirm_state).toBe("drifted");
    expect(result.drift_items).toHaveLength(1);
    expect(result.drift_items[0]?.key).toBe("color.brand.primary");
    expect(result.drift_items[0]?.drift).toBe("VALUE_DRIFT");
    expect(result.drift_items[0]?.preset_value).toBe("#1677ff");
    expect(result.drift_items[0]?.current_value).toBe("#00ff00");
  });

  it("preset UNKNOWN 键 → unanchored 逐键披露（红线 11 宁缺毋假——无锚可比不入判卷分母）", async () => {
    await freshInit();
    const outcome = await runPresetDrift(dir, { family: "design-tokens" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetDriftResult;
    expect(result.unanchored).toContain("color.brand.secondary");
    expect(result.denominator.skipped_preset_unknown).toBe(result.unanchored.length);
  });

  it("盘面缺席 → compared=0 → verdict=no_comparison（红线 10 blindspot——禁没查就报干净）", async () => {
    await freshInit();
    unlinkSync(join(dir, TOKENS_TARGET));
    const outcome = await runPresetDrift(dir, { family: "design-tokens" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetDriftResult;
    expect(result.verdict).toBe("no_comparison");
    expect(result.denominator.compared).toBe(0);
    expect(result.denominator.current_absent).toBeGreaterThan(0);
  });
});

// ============================================================
// D 段：design-tokens 族 · 适配分析（族 4）
// ============================================================

describe("preset applicability --family design-tokens（适配分析——只读匹配不改判卷）", () => {
  it("fresh init（栈全 UNKNOWN）→ ui/css 行 match=unresolved → verdict=partial", async () => {
    await freshInit();
    const outcome = await runPresetApplicability(dir, { family: "design-tokens" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetApplicabilityResult;
    expect(result.write_surface).toBe("none");
    expect(result.lanes).toHaveLength(1);
    expect(result.lanes[0]?.lane).toBe("frontend");
    expect(result.lanes[0]?.applicable).toBe(true);
    expect(result.faces).toEqual(["baseline/frontend/design-tokens.yaml"]);
    const rows = new Map(result.stack_match.map((row) => [row.key, row]));
    expect(rows.get("ui")?.match).toBe("unresolved");
    expect(rows.get("css")?.match).toBe("unresolved");
    expect(result.verdict).toBe("partial");
  });

  it("栈选型 antdesign + cssinjs 首位 → 双行 native → verdict=applicable", async () => {
    await freshInit();
    expect((await runBaselineSet(dir, { lane: "frontend", key: "ui", value: "antdesign" })).ok).toBe(true);
    expect(
      (
        await runBaselineSet(dir, {
          lane: "frontend",
          key: "css",
          value: "scoped-sfc+antdv-cssinjs-tokens+antdv-reset-css",
        })
      ).ok,
    ).toBe(true);
    const outcome = await runPresetApplicability(dir, { family: "design-tokens" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetApplicabilityResult;
    const rows = new Map(result.stack_match.map((row) => [row.key, row]));
    expect(rows.get("ui")?.match).toBe("native");
    expect(rows.get("css")?.match).toBe("native");
    expect(rows.get("ui")?.current_value).toBe("antdesign");
    expect(result.verdict).toBe("applicable");
  });

  it("ui=mui → mismatch 行 → verdict=mismatch + basis 点名预设主源（红线 11 对照基准可溯）", async () => {
    await freshInit();
    expect((await runBaselineSet(dir, { lane: "frontend", key: "ui", value: "mui" })).ok).toBe(true);
    const outcome = await runPresetApplicability(dir, { family: "design-tokens" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetApplicabilityResult;
    const rows = new Map(result.stack_match.map((row) => [row.key, row]));
    expect(rows.get("ui")?.match).toBe("mismatch");
    expect(result.verdict).toBe("mismatch");
    expect(result.preset_source).toContain("Ant Design");
    expect(result.notes.join("\n")).toContain("advisory");
  });
});

// ============================================================
// E 段：baseline-framework 族 · 预览 diff（族 1 栈选型预设值）
// ============================================================

describe("preset preview --family baseline-framework（栈选型预设——候选首位锚）", () => {
  it("fresh init → 14 条目全 fill + chain_effects 双 lane 门态行（resolved 0/9、0/5）", async () => {
    await freshInit();
    const outcome = await runPresetPreview(dir, { family: "baseline-framework" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetPreviewResult;
    expect(result.lane).toBeNull();
    expect(result.write_surface).toBe("none");
    expect(result.entries).toHaveLength(14);
    for (const entry of result.entries) {
      expect(entry.action_if_applied).toBe("fill");
      expect(entry.governed_path).toContain("baseline set");
    }
    const framework = result.entries.find((entry) => entry.key === "frontend.framework");
    expect(framework?.preset_value).toBe("vue3");
    expect(framework?.current_value).toBe("UNKNOWN");
    const effects = result.chain_effects.join("\n");
    expect(effects).toContain("0/9");
    expect(effects).toContain("0/5");
    expect(effects).toContain("PRESET-DRAFT");
  });

  it("set frontend framework=react → 该键 overwrite（governed_path 携 --change）+ 门态 1/9", async () => {
    await freshInit();
    expect(
      (await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "react" })).ok,
    ).toBe(true);
    const outcome = await runPresetPreview(dir, { family: "baseline-framework" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetPreviewResult;
    const framework = result.entries.find((entry) => entry.key === "frontend.framework");
    expect(framework?.action_if_applied).toBe("overwrite");
    expect(framework?.current_value).toBe("react");
    expect(framework?.governed_path).toContain("--change");
    expect(result.chain_effects.join("\n")).toContain("1/9");
  });

  it("--lane frontend → 仅 9 条目（lane 过滤）", async () => {
    await freshInit();
    const outcome = await runPresetPreview(dir, { family: "baseline-framework", lane: "frontend" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetPreviewResult;
    expect(result.lane).toBe("frontend");
    expect(result.entries).toHaveLength(9);
    for (const entry of result.entries) expect(entry.key).toMatch(/^frontend\./);
  });

  it("盘面 stack.yaml 缺席 → NOT_CONFIGURED fail-closed（未播种禁猜测）", async () => {
    await freshInit();
    unlinkSync(join(dir, ".pomaster/baseline/frontend/stack.yaml"));
    const outcome = await runPresetPreview(dir, { family: "baseline-framework" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_CONFIGURED");
    expect(outcome.errors[0]?.message).toContain("stack.yaml");
  });
});

// ============================================================
// F 段：baseline-framework 族 · 漂移检测（族 1）
// ============================================================

describe("preset drift --family baseline-framework（栈选型值对账）", () => {
  it("fresh init（全未选型）→ compared=0 → verdict=no_comparison + 分母披露", async () => {
    await freshInit();
    const outcome = await runPresetDrift(dir, { family: "baseline-framework" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetDriftResult;
    expect(result.verdict).toBe("no_comparison");
    expect(result.denominator.compared).toBe(0);
    expect(result.denominator.current_unknown).toBe(14);
    expect(result.notes.join("\n")).toContain("分母");
  });

  it("framework=react → VALUE_DRIFT frontend.framework（vue3 vs react）→ verdict=drifted + 漂移≠违规注记", async () => {
    await freshInit();
    expect(
      (await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "react" })).ok,
    ).toBe(true);
    const outcome = await runPresetDrift(dir, { family: "baseline-framework" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetDriftResult;
    expect(result.verdict).toBe("drifted");
    expect(result.drift_items).toHaveLength(1);
    expect(result.drift_items[0]?.key).toBe("frontend.framework");
    expect(result.drift_items[0]?.drift).toBe("VALUE_DRIFT");
    expect(result.drift_items[0]?.preset_value).toBe("vue3");
    expect(result.drift_items[0]?.current_value).toBe("react");
    expect(result.notes.join("\n")).toContain("违规");
  });
});

// ============================================================
// G 段：baseline-framework 族 · 适配分析（族 1）
// ============================================================

describe("preset applicability --family baseline-framework（lane/face/overlay 覆盖声明）", () => {
  it("双 lane 声明（FE 6 面 / BE 16 面）+ faces=24 + preset 栈 overlay 资产全在座 → applicable", async () => {
    await freshInit();
    const outcome = await runPresetApplicability(dir, { family: "baseline-framework" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetApplicabilityResult;
    expect(result.verdict).toBe("applicable");
    expect(result.write_surface).toBe("none");
    const lanes = new Map(result.lanes.map((lane) => [lane.lane, lane]));
    expect(lanes.get("frontend")?.applicable).toBe(true);
    expect(lanes.get("frontend")?.faces).toBe(6);
    expect(lanes.get("backend")?.applicable).toBe(true);
    expect(lanes.get("backend")?.faces).toBe(16);
    expect(result.faces).toHaveLength(24); // 2 stack.yaml + 22 md
    // preset 栈词（vue3/antdesign/cssinjs/java/spring/mybatis/mysql/redis）overlay 资产在座。
    const overlayPaths = result.overlay_assets.map((asset) => asset.path);
    expect(overlayPaths.length).toBeGreaterThanOrEqual(6);
    expect(overlayPaths.join("\n")).toContain("vue3");
    expect(overlayPaths.join("\n")).toContain("spring-boot");
    for (const asset of result.overlay_assets) expect(asset.present).toBe(true);
    expect(result.notes.join("\n")).toContain("drift");
  });

  it("包内 overlay 资产缺席（注入缺失 seedsRoot）→ present=false 诚实披露 → verdict=partial（红线 11）", async () => {
    await freshInit();
    const outcome = await runPresetApplicability(
      dir,
      { family: "baseline-framework" },
      { seedsRoot: join(dir, "no-such-seeds") },
    );
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetApplicabilityResult;
    expect(result.overlay_assets.length).toBeGreaterThan(0);
    for (const asset of result.overlay_assets) expect(asset.present).toBe(false);
    expect(result.verdict).toBe("partial");
  });
});

// ============================================================
// H 段：红线钉面（纯读零写入 + runCli 注册面）
// ============================================================

describe("preset 探测器红线钉面", () => {
  it("纯读零写入：初始化盘面字节快照在三探测器前后恒等（零 store 事务）", async () => {
    await freshInit();
    const before = snapshotStore();
    expect(before.size).toBeGreaterThan(0);
    expect((await runPresetPreview(dir, { family: "design-tokens" })).ok).toBe(true);
    expect((await runPresetDrift(dir, { family: "design-tokens" })).ok).toBe(true);
    expect((await runPresetApplicability(dir, { family: "design-tokens" })).ok).toBe(true);
    expect((await runPresetPreview(dir, { family: "baseline-framework" })).ok).toBe(true);
    expect((await runPresetDrift(dir, { family: "baseline-framework" })).ok).toBe(true);
    expect((await runPresetApplicability(dir, { family: "baseline-framework" })).ok).toBe(true);
    expect(snapshotStore()).toEqual(before);
  });

  it("未初始化目录可跑（design-tokens 盘面缺席诚实降级）且零 .pomaster 创建", async () => {
    const outcome = await runPresetPreview(dir, { family: "design-tokens" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as PresetPreviewResult;
    expect(result.denominator.compared).toBe(0);
    expect(existsSync(join(dir, ".pomaster"))).toBe(false);
  });

  it("runCli 注册面：--json 信封 command=preset preview + ok exit 0；缺 --family → exit 1", async () => {
    await freshInit();
    const lines: string[] = [];
    const code = await runCli(["--dir", dir, "preset", "preview", "--family", "design-tokens", "--json"], {
      stdout: (line) => lines.push(line),
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as {
      command: string;
      ok: boolean;
      result: PresetPreviewResult;
    };
    expect(envelope.command).toBe("preset preview");
    expect(envelope.ok).toBe(true);
    expect(envelope.result.family).toBe("design-tokens");

    const failCode = await runCli(["--dir", dir, "preset", "preview", "--json"], {
      stdout: () => undefined,
      stderr: () => undefined,
    });
    expect(failCode).toBe(1);
  });

  it("runCli：family 词表外 → exit 1 + PRESET_FAMILY_UNKNOWN；drift/applicability 命令词形注册", async () => {
    await freshInit();
    const lines: string[] = [];
    const code = await runCli(["--dir", dir, "preset", "drift", "--family", "nope", "--json"], {
      stdout: (line) => lines.push(line),
      stderr: () => undefined,
    });
    expect(code).toBe(1);
    const envelope = JSON.parse(lines.join("\n")) as {
      command: string;
      ok: boolean;
      errors: { code: string }[];
    };
    expect(envelope.command).toBe("preset drift");
    expect(envelope.errors[0]?.code).toBe("PRESET_FAMILY_UNKNOWN");

    const fitLines: string[] = [];
    const fitCode = await runCli(
      ["--dir", dir, "preset", "applicability", "--family", "baseline-framework", "--json"],
      { stdout: (line) => fitLines.push(line), stderr: () => undefined },
    );
    expect(fitCode).toBe(0);
    const fitEnvelope = JSON.parse(fitLines.join("\n")) as {
      command: string;
      ok: boolean;
      result: PresetApplicabilityResult;
    };
    expect(fitEnvelope.command).toBe("preset applicability");
    expect(fitEnvelope.result.verdict).toBe("applicable");
  });
});
