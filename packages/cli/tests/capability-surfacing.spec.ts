/**
 * capability-surfacing.spec.ts —— 09-06 能力显性化四面钉版（Owner 裁定：能力不能静默）。
 *
 * C1 · init 完成横幅能力速览段：每次 init 全量展示（NO_CHANGE 亦不精简——Owner 明选）、
 *      --json result.capability_overview 结构化字段同步（§45 双形态）、内容与命令
 *      注册表钉版（能力地图里的命令必须在注册表在座）；
 * C2 · AGENTS.md 能力地图节（Agent 视角转述面——场景命中时主动转述给用户）：与
 *      「重入口安装物」节分工不重复（能力地图=用户能做什么，安装物=装了什么）；
 *      最小形态（--platforms none）无此节（重入口模板专属）；
 * C3 · 错误码 hint 下一步命令化：抽查 ≥10 个错误码 hint 含确切 pomaster 命令词形
 *      （与审计 N5 R_MANIFEST_STALE 重编译入口同精神——导航给出口，不只报错）；
 * C4 · status 轮换 tip：capability_tips 默认开（键/文件缺席向后兼容 fail-open）/
 *      显式 false 关闭零输出 / 按 generation.seq 确定性轮换（零墙钟，同 seq 同 tip）
 *      三态；tip 池 8-12 条覆盖冷门能力且命令词形与注册表钉版。
 *
 * 共享内容源（heavy-entry.ts CAPABILITY_OVERVIEW / status.ts CAPABILITY_TIP_POOL）
 * 与 CLI 注册表（createProgram）钉版防漂移：任何能力提示词形先入注册表、再进提示面。
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Command } from "commander";
import {
  AGENTS_MD_RELATIVE,
  CAPABILITY_MAP_HEADING,
  CAPABILITY_OVERVIEW,
  CAPABILITY_TIP_POOL,
  capabilityTipForSeq,
  CONFIG_RELATIVE,
  createProgram,
  parseCapabilityTipsEnabled,
  runAlerts,
  runCatalogStatus,
  runCli,
  runGraph,
  runInit,
  runKnowledgeSearch,
  runProductionBandDefine,
  runSessionOverview,
  runStatus,
  runTraceShow,
  TRUTH_INDEX_RELATIVE,
} from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-capability-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ============================================================
// 注册表树（C1/C2/C4 钉测共用——命令词形必须逐级在座）
// ============================================================

interface CommandNode {
  readonly children: Map<string, CommandNode>;
}

function buildRegistryTree(): Map<string, CommandNode> {
  const toNode = (cmd: Command): CommandNode => ({
    children: new Map(
      cmd.commands
        .filter((sub) => sub.name() !== "help")
        .map((sub) => [sub.name(), toNode(sub)]),
    ),
  });
  const program = createProgram();
  return new Map(
    program.commands
      .filter((cmd) => cmd.name() !== "help")
      .map((cmd) => [cmd.name(), toNode(cmd)]),
  );
}

/** 子命令词形（小写连字符 token）才参与逐级下钻；占位词/旗标/参数词形止步。 */
const SUB_FORM = /^[a-z][a-z0-9-]*$/;

/**
 * 命令词形钉测：`pomaster` 后首 token 必须在顶层注册表；后续子命令 token 逐级在座
 * （最深 production band define 三级）。任一级缺席即红（提示面与注册表漂移防线）。
 */
function expectCommandInRegistry(command: string, registry: Map<string, CommandNode>): void {
  const tokens = command.split(/\s+/);
  const head = tokens[1];
  expect(head, `命令「${command}」缺顶层词形`).toBeDefined();
  let node = registry.get(head!);
  expect(node, `命令「${command}」顶层词形 ${head} 必须在 CLI 注册表在座（--help 单一事实源）`).toBeDefined();
  for (const token of tokens.slice(2)) {
    if (!SUB_FORM.test(token)) break;
    const child = node!.children.get(token);
    expect(child, `命令「${command}」子命令 ${token} 必须在 ${head} 注册子命令中`).toBeDefined();
    node = child;
  }
}

/** 抽取文本内全部 `pomaster …` 命令词形（ASCII 子命令 token 连跑；中文/旗标止步）。 */
function extractPomasterCommands(text: string): string[] {
  return text.match(/pomaster( [a-z][a-z0-9-]*)+/g) ?? [];
}

// ============================================================
// C1 · init 完成横幅能力速览段（每次全量 + --json 字段 + 注册表钉版）
// ============================================================

describe("C1 · init 能力速览段", () => {
  it("人读横幅含「你现在可以做什么」段：8 条场景 → 命令/出口逐条在座（§45 零 ANSI 纯文本）", async () => {
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    const text = outcome.human.join("\n");
    expect(text).toContain("你现在可以做什么（能力速览——完整命令面见 pomaster --help）:");
    expect(CAPABILITY_OVERVIEW).toHaveLength(8);
    for (const entry of CAPABILITY_OVERVIEW) {
      expect(text).toContain(entry.scene);
      expect(text).toContain(entry.command === "" ? entry.detail : entry.command);
    }
    for (const line of outcome.human) {
      expect(line).not.toContain("\x1b[");
    }
  });

  it("每次 init 全量展示：二次 NO_CHANGE 速览段仍在座（Owner 明选，不做 NO_CHANGE 精简）", async () => {
    await runInit(dir);
    const second = await runInit(dir);
    expect(second.result.change).toBe("NO_CHANGE");
    const text = second.human.join("\n");
    expect(text).toContain("你现在可以做什么");
    for (const entry of CAPABILITY_OVERVIEW) {
      expect(text).toContain(entry.scene);
    }
  });

  it("--json 信封同步 result.capability_overview 结构化字段（与共享内容源逐条 deep-equal）", async () => {
    const outcome = await runInit(dir);
    expect(outcome.result.capability_overview).toEqual(CAPABILITY_OVERVIEW);
    // 信封原料零横幅文案污染（§45 单信封）：速览以结构化数组进 result，非 human 行。
    expect(JSON.stringify(outcome.result)).toContain("capability_overview");
  });

  it("钉版：速览段每条命令词形必须在 CLI 注册表在座（含 production 级三级下钻能力）", () => {
    const registry = buildRegistryTree();
    for (const entry of CAPABILITY_OVERVIEW) {
      if (entry.command !== "") {
        expectCommandInRegistry(entry.command, registry);
      }
    }
  });
});

// ============================================================
// C2 · AGENTS.md 能力地图节（Agent 视角转述面）
// ============================================================

describe("C2 · AGENTS.md 能力地图节", () => {
  it("重入口模板含能力地图节：标题 + 全部场景 → 命令 + 时机点告知纪律注记", async () => {
    await runInit(dir);
    const agents = readFileSync(join(dir, AGENTS_MD_RELATIVE), "utf8");
    expect(agents).toContain(CAPABILITY_MAP_HEADING);
    for (const entry of CAPABILITY_OVERVIEW) {
      expect(agents).toContain(entry.scene);
      expect(agents).toContain(entry.command === "" ? entry.detail : `\`${entry.command}\``);
    }
    // Agent 视角转述指令在座；推销纪律同步钉住（Out of Scope：禁闲聊插广告）。
    expect(agents).toContain("主动把对应命令转述给用户");
    expect(agents).toContain("禁在无关对话里插广告");
  });

  it("与「重入口安装物」节分工不重复：两节各自在座、能力地图在前（内容不互相吞并）", async () => {
    await runInit(dir);
    const agents = readFileSync(join(dir, AGENTS_MD_RELATIVE), "utf8");
    expect(agents).toContain("## 重入口安装物（init 维护）");
    expect(agents).toContain("## 常用命令");
    const mapIdx = agents.indexOf(CAPABILITY_MAP_HEADING);
    const installIdx = agents.indexOf("## 重入口安装物（init 维护）");
    expect(mapIdx).toBeGreaterThan(-1);
    expect(installIdx).toBeGreaterThan(mapIdx);
    // 能力地图 = 用户能做什么（场景词形），安装物 = 装了什么（文件路径词形）——
    // 能力地图节不含安装物专属路径表述，反之亦然（抽查双向）。
    const mapSection = agents.slice(mapIdx, installIdx);
    expect(mapSection).not.toContain(".agents/skills/");
    expect(mapSection).toContain('pomaster triage "<request>"');
  });

  it("最小形态（--platforms none）无能力地图节（重入口模板专属；常用命令段照常在座）", async () => {
    await runInit(dir, { platforms: "none" });
    const agents = readFileSync(join(dir, AGENTS_MD_RELATIVE), "utf8");
    expect(agents).not.toContain(CAPABILITY_MAP_HEADING);
    expect(agents).toContain("## 常用命令");
  });

  it("钉版：AGENTS.md 能力地图节的命令词形与注册表逐条在座（单一内容源防漂移）", async () => {
    await runInit(dir);
    const agents = readFileSync(join(dir, AGENTS_MD_RELATIVE), "utf8");
    const mapIdx = agents.indexOf(CAPABILITY_MAP_HEADING);
    const installIdx = agents.indexOf("## 重入口安装物（init 维护）");
    const mapSection = agents.slice(mapIdx, installIdx);
    const registry = buildRegistryTree();
    const commands = extractPomasterCommands(mapSection);
    expect(commands.length).toBeGreaterThanOrEqual(7); // 8 条中 7 条命令出口（画廊条目非命令）
    for (const command of commands) {
      expectCommandInRegistry(command, registry);
    }
  });
});

// ============================================================
// C3 · 错误码 hint 下一步命令化（抽查 ≥10 错误码 hint 含确切命令词形）
// ============================================================

describe("C3 · 错误码 hint 下一步命令化", () => {
  function writeLedgerRaw(raw: string): void {
    mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
    writeFileSync(join(dir, ".pomaster", "state", "truth-index.json"), raw, "utf8");
  }

  it("status NOT_INITIALIZED → hint 含 pomaster init（既有基线在座对照）", async () => {
    const outcome = await runStatus(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
    expect(outcome.errors[0]?.hint).toContain("pomaster init");
  });

  it("init SCHEMA_INVALID（平台词形非法）→ hint 含 pomaster init --platforms 示例", async () => {
    const outcome = await runInit(dir, { platforms: "weex" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.hint).toContain("pomaster init --platforms");
  });

  it("init INVALID_STATE（账本坏 JSON）→ hint 含重跑 pomaster init 出口", async () => {
    writeLedgerRaw("{ not-json");
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("INVALID_STATE");
    expect(outcome.errors[0]?.hint).toContain("pomaster init");
  });

  it("status INVALID_STATE（账本坏 JSON）→ hint 含重跑 pomaster status 出口", async () => {
    writeLedgerRaw("%%");
    const outcome = await runStatus(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("INVALID_STATE");
    expect(outcome.errors[0]?.hint).toContain("pomaster status");
  });

  it("status CROSS_AXIS_PERMIT_MISSING 告警 → hint 含 pomaster reconcile 对账出口", async () => {
    await runInit(dir);
    const ledger = JSON.parse(readFileSync(join(dir, TRUTH_INDEX_RELATIVE), "utf8")) as {
      objects: unknown[];
    };
    ledger.objects.push({
      id: "PAGE.MIG",
      kind: "page_surface",
      axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "MIGRATING" },
      permits_active: [],
    });
    writeFileSync(
      join(dir, TRUTH_INDEX_RELATIVE),
      `${JSON.stringify(ledger, null, 2)}\n`,
      "utf8",
    );
    const outcome = await runStatus(dir);
    const warning = outcome.warnings.find((w) => w.code === "CROSS_AXIS_PERMIT_MISSING");
    expect(warning).toBeDefined();
    expect(warning?.hint).toContain("pomaster reconcile --permit");
  });

  it("alerts NOT_INITIALIZED 告警 → hint 含 pomaster init（既有基线在座对照）", async () => {
    const outcome = await runAlerts(dir);
    const warning = outcome.warnings.find((w) => w.code === "NOT_INITIALIZED");
    expect(warning).toBeDefined();
    expect(warning?.hint).toContain("pomaster init");
  });

  it("alerts 台账缺席告警 → hint 含 pomaster permit issue 建账出口", async () => {
    // 手写最小账本（不经 init——init 预植的 createStore 会补建 permits 侧车，
    // 缺席前提即消失；alerts.spec 缺席用例同款手工账本形态）。
    writeLedger(baseLedger(15));
    const outcome = await runAlerts(dir);
    const warning = outcome.warnings.find((w) => w.code === "ALERTS_PERMIT_LEDGER_MISSING");
    expect(warning).toBeDefined();
    expect(warning?.hint).toContain("pomaster permit issue");
  });

  it("session INVALID_STATE 告警 → hint 含重跑 pomaster session 出口", async () => {
    writeLedgerRaw("%%");
    const outcome = await runSessionOverview(dir);
    const warning = outcome.warnings.find((w) => w.code === "INVALID_STATE");
    expect(warning).toBeDefined();
    expect(warning?.hint).toContain("pomaster session");
  });

  it("check 未选腿 SCHEMA_INVALID → hint 含 pomaster check --fast / --gates 两腿词形", async () => {
    await runInit(dir);
    const out: string[] = [];
    const err: string[] = [];
    await runCli(["--dir", dir, "check", "--json"], {
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
    });
    const envelope = JSON.parse(out.join("\n")) as {
      errors: { code: string; hint: string }[];
    };
    expect(envelope.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(envelope.errors[0]?.hint).toContain("pomaster check --fast");
    expect(envelope.errors[0]?.hint).toContain("pomaster check --gates");
  });

  it("graph --view 词表外 SCHEMA_INVALID → hint 含 pomaster graph --view 示例", async () => {
    const outcome = await runGraph({ id: "PAGE.X", view: "bogus", rootDir: dir });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.hint).toContain("pomaster graph <governed-id> --view");
  });

  it("knowledge search 空查询 SCHEMA_INVALID → hint 含 pomaster knowledge search 示例", async () => {
    await runInit(dir);
    const outcome = await runKnowledgeSearch(dir, { query: "  " });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.hint).toContain("pomaster knowledge search");
  });

  it("production band define 缺必填 SCHEMA_INVALID → hint 含完整命令词形", async () => {
    await runInit(dir);
    const outcome = await runProductionBandDefine(dir, { id: "latency-band" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("BAND_SCHEMA_INVALID");
    expect(outcome.errors[0]?.hint).toContain("pomaster production band define");
  });

  it("trace show --seal 缺 --retention SCHEMA_INVALID → hint 含完整命令词形", async () => {
    await runInit(dir);
    const outcome = await runTraceShow(dir, "AGX-2026-00001", { seal: true });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.hint).toContain("pomaster trace show");
  });

  it("catalog 资产缺席 CATALOG_NOT_AVAILABLE → hint 含 --catalog-root 注入命令词形", async () => {
    const outcome = await runCatalogStatus({ catalogRoot: join(dir, "absent-catalog") });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("CATALOG_NOT_AVAILABLE");
    expect(outcome.errors[0]?.hint).toContain("pomaster catalog status --catalog-root");
  });

  it("UNEXPECTED_ERROR 兜底 → hint 含 pomaster --help 对账词形", async () => {
    const out: string[] = [];
    const err: string[] = [];
    await runCli(["--dir", dir, "definitely-not-a-command", "--json"], {
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
    });
    // --json 通道：UNEXPECTED_ERROR 信封整体（多行）写 stdout。
    const envelope = JSON.parse(out.join("\n")) as {
      errors?: { code: string; hint: string }[];
    };
    expect(envelope.errors?.[0]?.code).toBe("UNEXPECTED_ERROR");
    expect(envelope.errors?.[0]?.hint).toContain("pomaster --help");
  });
});

// ============================================================
// C4 · status 轮换 tip（默认开 / 关闭 / 轮换确定性三态 + 池钉版）
// ============================================================

function baseLedger(seq: number): Record<string, unknown> {
  return {
    ir_schema: "pomaster.truth-index/v1-draft",
    content_digest: "sha256:" + "0".repeat(64),
    generation: {
      tool: "pomaster-cli@0.0.0",
      seq,
      inputs_fingerprint: "sha256:" + "1".repeat(64),
    },
    vocab_lock: {
      state_axes: "sha256:" + "2".repeat(64),
      kinds: "sha256:" + "3".repeat(64),
      prefixes: "sha256:" + "4".repeat(64),
    },
    denominators: [],
    objects: [],
    producers: [],
    health: { dead_producers: [], orphaned_objects: [], worst_blindspot: null, alias_conflicts: [] },
    integrity_ruleset: "REF_INTEGRITY@v1",
  };
}

function writeLedger(ledger: unknown): void {
  mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
  writeFileSync(
    join(dir, ".pomaster", "state", "truth-index.json"),
    `${JSON.stringify(ledger, null, 2)}\n`,
    "utf8",
  );
}

describe("C4 · status 轮换 tip", () => {
  it("默认开：init 后 status 尾部（next 行后）带 tip 行，--json capability_tip 同步", async () => {
    await runInit(dir);
    const outcome = await runStatus(dir);
    expect(outcome.ok).toBe(true);
    const tipLine = outcome.human.find((line) => line.startsWith("  tip: "));
    expect(tipLine).toBeDefined();
    expect(tipLine).toBe(`  tip: ${capabilityTipForSeq(outcome.result.generation_seq)}`);
    // tip 行在 next 行之后（版式契约：next → tip 收尾）。
    const nextIdx = outcome.human.findIndex((line) => line.startsWith("  next: "));
    const tipIdx = outcome.human.findIndex((line) => line.startsWith("  tip: "));
    expect(nextIdx).toBeGreaterThan(-1);
    expect(tipIdx).toBe(nextIdx + 1);
    expect(outcome.result.capability_tip).toBe(capabilityTipForSeq(1));
  });

  it("向后兼容：旧 config 缺 capability_tips 键 = 默认开（tip 仍在座）", async () => {
    await runInit(dir);
    writeFileSync(join(dir, CONFIG_RELATIVE), "version: 1\nprofile: LIGHT\n", "utf8");
    const outcome = await runStatus(dir);
    expect(outcome.human.join("\n")).toContain("  tip: ");
    expect(outcome.result.capability_tip).toBeDefined();
  });

  it("显式 false：config capability_tips: false → 人读零 tip 行 + --json 字段缺席", async () => {
    await runInit(dir);
    writeFileSync(
      join(dir, CONFIG_RELATIVE),
      "version: 1\nprofile: LIGHT\ncapability_tips: false\n",
      "utf8",
    );
    const outcome = await runStatus(dir);
    expect(outcome.human.join("\n")).not.toContain("  tip: ");
    expect(outcome.result.capability_tip).toBeUndefined();
  });

  it("轮换确定性：同 seq 同 tip（零墙钟）；异 seq 异 tip（池内轮转）", async () => {
    writeLedger(baseLedger(7));
    const first = await runStatus(dir);
    expect(first.result.capability_tip).toBe(CAPABILITY_TIP_POOL[7]);

    const repeat = await runStatus(dir);
    expect(repeat.result.capability_tip).toBe(first.result.capability_tip);

    rmSync(join(dir, ".pomaster"), { recursive: true, force: true });
    writeLedger(baseLedger(8));
    const advanced = await runStatus(dir);
    expect(advanced.result.capability_tip).toBe(CAPABILITY_TIP_POOL[8]);
    expect(advanced.result.capability_tip).not.toBe(first.result.capability_tip);
  });

  it("解析器契约：键缺席/文本不可解析/值词形不识别一律默认开；仅显式 false（容忍引号注释）关闭", () => {
    expect(parseCapabilityTipsEnabled("")).toBe(true);
    expect(parseCapabilityTipsEnabled("version: 1\nprofile: LIGHT\n")).toBe(true);
    expect(parseCapabilityTipsEnabled("capability_tips: true\n")).toBe(true);
    expect(parseCapabilityTipsEnabled("capability_tips: true  # 注释\n")).toBe(true);
    expect(parseCapabilityTipsEnabled('capability_tips: "false"\n')).toBe(false);
    expect(parseCapabilityTipsEnabled("capability_tips: false # 关闭\n")).toBe(false);
    expect(parseCapabilityTipsEnabled("capability_tips: maybe\n")).toBe(true);
  });

  it("池钉版：8-12 条互异、每条含场景与命令、全部命令词形在 CLI 注册表在座", () => {
    expect(CAPABILITY_TIP_POOL.length).toBeGreaterThanOrEqual(8);
    expect(CAPABILITY_TIP_POOL.length).toBeLessThanOrEqual(12);
    expect(new Set(CAPABILITY_TIP_POOL).size).toBe(CAPABILITY_TIP_POOL.length);
    const registry = buildRegistryTree();
    let checkedCommands = 0;
    for (const tip of CAPABILITY_TIP_POOL) {
      expect(tip).toContain("pomaster ");
      for (const command of extractPomasterCommands(tip)) {
        expectCommandInRegistry(command, registry);
        checkedCommands += 1;
      }
    }
    expect(checkedCommands).toBeGreaterThanOrEqual(12); // 分母自检：词形抽取为空 = 假绿
  });
});
