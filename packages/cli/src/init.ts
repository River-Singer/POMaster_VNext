/**
 * init.ts —— `pomaster init`：BOOTSTRAP 段的骨架创建与 Agent 入口生成。
 *
 * 入口形态（D13 2026-09-03 修订：重入口默认；B7 裁定 Owner 2026-09-04：init 单一
 * 重入口——早期 `--mode` 双模式旗标与轻入口退回/移除逻辑已删除）：
 * - 平台选择非空（缺省 claude）：重入口全套——skills 命令卡库双镜像（`.agents/skills/`
 *   通用层 + `.claude/skills/` Claude Code 必需位，逐字节一致）+ claude hooks 注册
 *   （`.claude/settings.json` 读-合并-写回，SessionStart → `pomaster session` 速览、
 *   UserPromptSubmit → `pomaster alerts` 轻提醒）+ cursor/qoder 加厚版 rules
 *   （命令卡/Browser Eyes 展开）；
 * - `--platforms none`：零平台产物形态——只建 AGENTS.md + 状态骨架（最小指针正文，
 *   无重入口安装物；重跑 init（缺省平台）即安装重入口全套）。
 * 预铺目录骨架（Owner 2026-09-04 修订裁定：**不分模式**——宪法 §2 Target Directory
 * Tree 全量在 init 一次性建出，与入口形态/平台选择无关；「AI 自己判断是否是复杂还是
 * 简单需求或者项目，对应激活相关目录」——激活提示落 layout.json activation_hint；
 * 此裁定覆盖宪法 §17 Lazy Materialization 与早期 wired/planned 双状态设计）。
 * layout.json 全目录 status=wired + activation_hint + constitution_source；每目录
 * README；运行时物化语义不变（kernel paths.ts 仍为唯一登记处，store-layout.ts 仅
 * 委托派生）。零运行时第三方依赖的 D13 原 facets 不变（hook 只是 shell form 调
 * `pomaster` 自身）。
 *
 * 幂等纪律（A4 / No-op is elegant）：连续两次 init，第二次必须 NO_CHANGE——
 * 全部产物字节稳定（禁墙钟时间：账本 seq=0 起点、入口文件无时间戳）；
 * 已存在文件按字节比较，一致即零写入。
 *
 * 不覆盖人类文件：
 * - config.yaml 只在缺失时创建（人类可编辑）；
 * - state/truth-index.json 只在缺失时创建；存在但不可解析 → 显式报错 INVALID_STATE，
 *   绝不静默覆盖（clobber 家族教训）；
 * - state/authority.json 只在缺失时创建（N7：BOOTSTRAP owner 骨架，单人项目默认形态——
 *   Minimum Sufficient Governance：只登记项目级 BOOTSTRAP_OWNER，细粒度 owner 划分等
 *   多人信号出现再演化）；存在但不可解析 / 结构不合 kernel 解析契约 → 显式报错
 *   INVALID_STATE，绝不静默覆盖；合法存在（含人类加注的 owner）→ 一律不动；
 * - AGENTS.md/CLAUDE.md/技能卡/settings.json 仅当缺失或带本包生成标记时重写
 *   （settings.json 另有结构校验：坏 JSON/结构不合 → fail-closed 跳过，绝不覆盖）。
 *
 * F1 平台选择：Trellis 惯例——一次 init 覆盖多平台 AI 入口目录。AGENTS.md 恒为唯一
 * 事实源；平台适配器（--platforms 逗号列表）：
 * - claude → CLAUDE.md（@AGENTS.md 导入）+ `.claude/skills/` 镜像 + hooks 注册
 * - codex  → 根 AGENTS.md 即 codex 原生入口（零额外文件，呈现 covered）
 * - cursor → .cursor/rules/pomaster.mdc（加厚版：命令卡/Browser Eyes 展开）
 * - qoder  → .qoder/rules/pomaster.md（加厚版）
 * `.agents/skills/` 通用层随任一非空平台选择生成（Codex/Cursor/Gemini CLI/Copilot/
 * VS Code/Amp/Warp/OpenCode/Droid 等原生读取；Owner 扩裁：支持该规范的 agent 都应
 * 支持）；`--platforms none` 只建 AGENTS.md + 状态骨架（零平台产物）。
 * 适配器存在即跳过（skipped-existing），绝不覆盖人类文件；`--platforms none` 只建
 * AGENTS.md + 状态骨架。TTY 人读模式无旗标时出复选清单（◉/◯ 空格勾选 / ↑↓ 移动 /
 * 回车确认，raw 模式 + 原地重绘；raw 启用失败降级编号输入）；--json 恒走确定性缺省
 * （机读通道禁交互阻塞）。ANSI 序列只允许出现在本文件的交互渲染器内（§45 纪律：
 * --json 信封与人读完成输出恒零 ANSI）。
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import {
  AGENTS_MD_RELATIVE,
  AUTHORITY_RELATIVE,
  CLAUDE_MD_RELATIVE,
  CONFIG_RELATIVE,
  CURSOR_RULES_RELATIVE,
  GENERATED_MARKER,
  LEGACY_OBJECTS_DIR_RELATIVE,
  POMASTER_DIR,
  QODER_RULES_RELATIVE,
  TRUTH_INDEX_RELATIVE,
  TRUTH_OBJECTS_DIR_RELATIVE,
  authorityFilePath,
  configPath,
  ensureParentDir,
  toPosix,
  truthIndexPath,
} from "./store-layout.js";
import { INIT_TOOL_ID, buildSkeletonLedger } from "./digest.js";
import {
  LAYOUT_DIRECTORIES,
  LAYOUT_MANIFEST_RELATIVE,
  renderLayoutManifest,
  renderLayoutReadme,
} from "./layout.js";
import {
  CLAUDE_SETTINGS_RELATIVE,
  COMMAND_PANORAMA_LINES,
  ENTRY_MODE_HEAVY_MARKER,
  SKILL_MANIFEST,
  SKILL_MIRROR_DIRS,
  mergePomasterHooks,
  renderSkillMd,
} from "./heavy-entry.js";
import {
  TRIAGE_PROFILES,
  TRIAGE_TTL_HOURS,
  type TriageProfile,
} from "./triage.js";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";

export type InitFileAction =
  | "created"
  | "updated"
  | "unchanged"
  | "skipped_foreign";

export interface InitFileReport {
  readonly file: string;
  readonly action: InitFileAction;
}

export type InitChange = "CREATED" | "UPDATED" | "NO_CHANGE";

// ============================================================
// F1：平台适配器注册表（claude / codex / cursor / qoder）
// ============================================================
/** 平台词表闭包（词表外词形 → SCHEMA_INVALID 列出合法词形，fail-closed）。 */
export const INIT_PLATFORMS = ["claude", "codex", "cursor", "qoder"] as const;
export type InitPlatform = (typeof INIT_PLATFORMS)[number];

/**
 * 平台段动作词形：created = 本次新建；skipped-existing = 适配器已在座（同形在座或
 * 人类异形文件，一律不覆盖）；updated = 本包产物形态升级（细指针↔加厚版重写）；
 * covered = 平台原生入口即 AGENTS.md，零额外文件（codex）。
 */
export type InitPlatformAction = "created" | "skipped-existing" | "updated" | "covered";

export interface InitPlatformReport {
  readonly name: InitPlatform;
  /** 产出/覆盖文件（POSIX 相对路径；codex = 根 AGENTS.md）。 */
  readonly file: string;
  readonly action: InitPlatformAction;
}

export interface InitResult {
  readonly change: InitChange;
  readonly tool: typeof INIT_TOOL_ID;
  /** config.yaml 信息性治理档位回读（A1 裁定 2026-09-04：人类偏好呈现，非治理输入）。 */
  readonly profile: TriageProfile;
  readonly files: readonly InitFileReport[];
  /** F1 平台段：registry 顺序、仅含选中平台（--json result.platforms，§45 信封内结构化数据）。 */
  readonly platforms: readonly InitPlatformReport[];
}

export interface InitOptions {
  /**
   * --platforms 词形原文（逗号分隔；合法词形 = 平台名 | none，另容交互词形 编号 | a/all）。
   * undefined = 未携带：CLI 非交互路径缺省 claude（现行为）。
   */
  readonly platforms?: string | undefined;
}

/**
 * 细指针正文（cursor/qoder 适配器历史细指针形态与 `--platforms none` 最小入口共用；
 * 标题 + 单行指针）。B7 裁定（2026-09-04）后 init 不再产出细指针适配器——本常量
 * 保留作存量旧版产物字节识别（升级重写判定）与 none 形态入口正文。
 */
const THIN_POINTER_BODY = [
  "# POMaster vNext — Agent 入口指针",
  "唯一事实源是仓库根的 `AGENTS.md`（由 `pomaster init` 生成，幂等）；先读根目录 `AGENTS.md`，遵循其「当前治理档位」与「常用命令」。",
].join("\n");

interface PlatformAdapterSpec {
  readonly name: InitPlatform;
  /** 产出文件（POSIX 相对路径）。 */
  readonly file: string;
  /** true = 平台原生入口即 AGENTS.md，零额外文件（呈现 covered，不落盘）。 */
  readonly coveredByAgentsMd: boolean;
  /** 适配器内容（加厚版；claude 走入口文件生命周期，本表仅登记清单呈现）。 */
  render: () => string;
  /**
   * 存量识别：历史细指针形态渲染值（B7 裁定后不再产出；旧版项目升级 init 时
   * 在座文件按此字节识别归本包维护并重写为加厚版）。
   */
  legacyThinRender?: () => string;
}

/**
 * 平台注册表（数组顺序 = 编号顺序 = 报告顺序）。格式随平台惯例：
 * cursor .mdc 用 description/globs/alwaysApply frontmatter；qoder .md 用
 * trigger: always_on frontmatter（参照本机 Trellis 根多平台目录形态，模仿其形）。
 * B7 裁定（2026-09-04）后只产加厚版；历史细指针形态经 legacyThinRender 保留字节
 * 识别（存量项目升级）。
 */
const CURSOR_FRONTMATTER_LINES = [
  "---",
  "description: POMaster vNext 治理入口（唯一事实源：仓库根 AGENTS.md）",
  "globs:",
  "alwaysApply: true",
  "---",
  "",
] as const;

const QODER_FRONTMATTER_LINES = [
  "---",
  "trigger: always_on",
  "---",
  "",
] as const;

const PLATFORM_ADAPTERS: readonly PlatformAdapterSpec[] = [
  {
    name: "claude",
    file: CLAUDE_MD_RELATIVE,
    coveredByAgentsMd: false,
    render: () => CLAUDE_ENTRY_CONTENT,
  },
  {
    name: "codex",
    file: AGENTS_MD_RELATIVE,
    coveredByAgentsMd: true,
    render: () => "",
  },
  {
    name: "cursor",
    file: CURSOR_RULES_RELATIVE,
    coveredByAgentsMd: false,
    render: () =>
      [
        ...CURSOR_FRONTMATTER_LINES,
        renderThickRulesBody(
          "Cursor 原生读取 `.agents/skills/pomaster*/` 通用层 skills 库（本 rules 与 skills 双通道并存）。",
        ),
      ].join("\n"),
    legacyThinRender: () => [...CURSOR_FRONTMATTER_LINES, THIN_POINTER_BODY].join("\n"),
  },
  {
    name: "qoder",
    file: QODER_RULES_RELATIVE,
    coveredByAgentsMd: false,
    render: () =>
      [
        ...QODER_FRONTMATTER_LINES,
        renderThickRulesBody(
          "本 rules 文件即本平台重入口（Qoder 不读取 `.agents/skills/` 通用层）；命令卡单一事实源 = `pomaster --help`。",
        ),
      ].join("\n"),
    legacyThinRender: () => [...QODER_FRONTMATTER_LINES, THIN_POINTER_BODY].join("\n"),
  },
];

/**
 * 加厚版 rules 正文（heavy 形态；PRD 裁决 2：AGENTS.md 的命令卡/Browser Eyes 内容
 * 展开进各自 rules 文件——cursor/qoder 无 hooks 概念，rules 加厚即其重入口）。
 * 命令全景与 router skill 共用同一常量（单一实现，零第二事实源）。
 */
function renderThickRulesBody(platformNote: string): string {
  return [
    "# POMaster vNext — Agent 入口（重入口 rules）",
    "",
    `唯一事实源是仓库根的 \`AGENTS.md\`（由 \`pomaster init\` 生成，幂等）；先读根目录 \`AGENTS.md\`，遵循其「当前治理档位」。${platformNote}`,
    "",
    "## 常用命令（与 `pomaster --help` 对账）",
    "",
    "```text",
    ...COMMAND_PANORAMA_LINES,
    "```",
    "",
    "## Browser Eyes（浏览器双眼）",
    "",
    "- chrome-devtools MCP = 观测眼：诊断「慢/报错/卡住」必须实测（performance trace / network / console），禁只看代码推断。",
    "- playwright MCP = 验证眼：E2E smoke / 交互验证用 playwright 确定性驱动。",
    "- 可用性自检：`pomaster doctor --json` 的 chrome_devtools_mcp / playwright_mcp 探针行。",
  ].join("\n");
}

const PLATFORM_WORDS_HINT = `合法词形：${INIT_PLATFORMS.join(" | ")} | none`;

export type PlatformSelectionParse =
  | { readonly ok: true; readonly platforms: readonly InitPlatform[] }
  | { readonly ok: false; readonly error: CliError };

/**
 * 解析 --platforms / 交互读行词形：逗号分隔；token ∈ 平台名 | none | 编号 1-N（交互）|
 * a/all（全选，交互）；none 必须独占；重复词形幂等去重（保持首次出现序）。
 * 词形非法 → SCHEMA_INVALID 列出合法词形（fail-closed，不猜测）。
 */
export function parsePlatformSelection(raw: string): PlatformSelectionParse {
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return {
      ok: false,
      error: {
        code: "SCHEMA_INVALID",
        message: `平台选择为空；${PLATFORM_WORDS_HINT}`,
        hint: "示例：--platforms claude,cursor 或 --platforms none。",
      },
    };
  }
  if (tokens.includes("none")) {
    if (tokens.length > 1) {
      return {
        ok: false,
        error: {
          code: "SCHEMA_INVALID",
          message: `none 不可与其他平台并列：${raw.trim()}`,
          hint: `${PLATFORM_WORDS_HINT}；只建 AGENTS.md/状态骨架时单独使用 none。`,
        },
      };
    }
    return { ok: true, platforms: [] };
  }
  const platforms: InitPlatform[] = [];
  const push = (platform: InitPlatform): void => {
    if (!platforms.includes(platform)) platforms.push(platform);
  };
  for (const token of tokens) {
    if ((INIT_PLATFORMS as readonly string[]).includes(token)) {
      push(token as InitPlatform);
      continue;
    }
    if (token === "a" || token === "all") {
      for (const platform of INIT_PLATFORMS) push(platform);
      continue;
    }
    if (/^[1-9][0-9]*$/.test(token)) {
      const platform = INIT_PLATFORMS[Number.parseInt(token, 10) - 1];
      if (platform === undefined) {
        return {
          ok: false,
          error: {
            code: "SCHEMA_INVALID",
            message: `平台编号越界：${token}；${PLATFORM_WORDS_HINT}`,
            hint: `编号对应 renderPlatformMenu 清单（1-${INIT_PLATFORMS.length}）。`,
          },
        };
      }
      push(platform);
      continue;
    }
    return {
      ok: false,
      error: {
        code: "SCHEMA_INVALID",
        message: `非法平台词形：${token}；${PLATFORM_WORDS_HINT}`,
        hint: "示例：--platforms claude,cursor 或 --platforms none。",
      },
    };
  }
  return { ok: true, platforms };
}

/** TTY 交互清单（编号 + 名称 + 产出文件路径；零依赖一行式选择，不做按键级 multiselect）。 */
export function renderPlatformMenu(): readonly string[] {
  const lines = ["可启用的平台适配器（AGENTS.md 恒生成，为唯一事实源；重入口默认）："];
  PLATFORM_ADAPTERS.forEach((spec, index) => {
    const note = spec.coveredByAgentsMd ? "（codex 原生入口，零额外文件）" : "";
    lines.push(`  ${index + 1}. ${spec.name.padEnd(7)} ${spec.file}${note}`);
  });
  lines.push("输入要启用的平台编号（逗号分隔，回车默认 claude；a=全选）：");
  return lines;
}

/** 交互面 IO 注入（index.ts 接 process.stdin/stdout；测试注入 fake 零 TTY）。 */
export interface InitInteractiveIo {
  readonly write: (line: string) => void;
  readonly readLine: () => Promise<string>;
}

/**
 * TTY 交互 init（降级路径）：复选清单 raw 模式启用失败（非终端句柄等）时的
 * 编号输入形态——打印平台清单 → 读一行 stdin → 解析选择 → 交由 runInit 执行。
 * 空行 = 缺省 claude；词形非法 = SCHEMA_INVALID fail-closed（零写入）。
 */
export async function runInitInteractive(
  rootDir: string,
  interactive: InitInteractiveIo,
): Promise<CommandOutcome<InitResult>> {
  for (const line of renderPlatformMenu()) interactive.write(line);
  const raw = (await interactive.readLine()).trim();
  const parse = parsePlatformSelection(raw === "" ? "claude" : raw);
  if (!parse.ok) {
    return failOutcome(
      "init",
      {
        change: "NO_CHANGE",
        tool: INIT_TOOL_ID,
        profile: "LIGHT",
        files: [],
        platforms: [],
      },
      [parse.error],
      ["init: FAILED — SCHEMA_INVALID", `  ${parse.error.message}`, `  hint: ${parse.error.hint}`],
    );
  }
  return runInit(rootDir, { platforms: parse.platforms.join(",") });
}

// ============================================================
// F1 交互升级：平台复选清单（Trellis 形态——◉/◯ 空格勾选 / ↑↓ 移动 / 回车确认）
// ============================================================
// §45 纪律注记：本节的 ANSI 光标控制序列（\x1b[nA 上移 / \x1b[0K 清行）只允许出现在
// redrawFrame 的出口、且只经 ChecklistIo.write 进入真实终端的 TTY 交互路径；
// --json 信封与人读完成输出恒零 ANSI（纪律不破）。

/** 清单按键词形闭包（raw 模式字节；测试与生产共用同一词表）。 */
export const CHECKLIST_KEYS = {
  /** ↑ */
  up: "\x1b[A",
  /** ↓ */
  down: "\x1b[B",
  /** 空格（0x20）：切换光标行选中态 */
  toggle: " ",
  /** 回车（\r；\n 亦收）：确认 */
  confirm: "\r",
  /** Ctrl+C：中止（终端恢复后由调用方退出） */
  abort: "\x03",
} as const;

/** 复选清单 IO 注入（生产 = raw stdin + stdout 原块写；测试 = 预录按键序列驱动）。 */
export interface ChecklistIo {
  /** 帧写入（首帧为纯文本行集；重绘帧含 redrawFrame 的 ANSI 序列——仅 TTY 交互路径）。 */
  readonly write: (chunk: string) => void;
  /**
   * 按键泵：逐键回调 handler；handler 返回 false = 停泵（确认/中止/流关闭）。
   * resolve 于泵结束。
   */
  readonly pumpKeys: (handler: (key: string) => boolean) => Promise<void>;
}

export type ChecklistPromptResult =
  | { readonly kind: "confirmed"; readonly platforms: readonly InitPlatform[] }
  | { readonly kind: "aborted" };

const CHECKLIST_HEADER = "? 启用哪些平台？（空格勾选 / ↑↓移动 / 回车确认）";

/** codex 行的选中语义注记（AGENTS.md 即原生入口——选中不落盘）。 */
const CHECKLIST_CODEX_NOTE = "（codex 原生读根 AGENTS.md，选中=已覆盖）";

/** 单行渲染：光标行顶格、非光标行前导一空格；◉/◯ = 选中态；名称 padEnd(9) 对齐「→ 产出文件」。 */
function checklistRow(
  platform: InitPlatform,
  file: string,
  note: string,
  checked: boolean,
  isCursor: boolean,
): string {
  const mark = checked ? "◉" : "◯";
  const prefix = isCursor ? "" : " ";
  return `${prefix}${mark} ${platform.padEnd(9)}→ ${file}${note}`;
}

/**
 * 渲染一帧（行集快照，零 ANSI——快照断言面；§45：本函数出口不含任何光标控制序列）。
 */
export function renderChecklistFrame(
  checked: ReadonlySet<InitPlatform>,
  cursor: number,
): string {
  const lines: string[] = [CHECKLIST_HEADER];
  PLATFORM_ADAPTERS.forEach((spec, index) => {
    const note = spec.coveredByAgentsMd ? CHECKLIST_CODEX_NOTE : "";
    lines.push(
      checklistRow(spec.name, spec.file, note, checked.has(spec.name), index === cursor),
    );
  });
  return lines.join("\n");
}

/** 原地重绘序列：光标上移至帧首行首 + 逐行清行重写（ANSI 全仓唯一出口，仅 TTY 交互路径）。 */
function redrawFrame(frame: string): string {
  const lines = frame.split("\n");
  return (
    `\x1b[${lines.length - 1}A\r` +
    lines
      .map((line, i) => `\x1b[0K${line}${i < lines.length - 1 ? "\n" : ""}`)
      .join("")
  );
}

/**
 * 复选清单交互：缺省选中 claude（与确定性缺省一致）；↑↓ 移动（顶/底行钳位）；
 * 空格切换光标行选中态；回车确认（按注册表序返回选中集，空集 = --platforms none
 * 等价）；Ctrl+C 中止。按键流耗尽未确认（EOF）按中止处理（fail-closed 不猜缺省）。
 */
export async function runChecklistPrompt(io: ChecklistIo): Promise<ChecklistPromptResult> {
  let cursor = 0;
  const checked = new Set<InitPlatform>(["claude"]);
  let done: ChecklistPromptResult | null = null;

  io.write(renderChecklistFrame(checked, cursor));

  await io.pumpKeys((key) => {
    if (done !== null) return false;
    if (key === CHECKLIST_KEYS.up) {
      cursor = Math.max(0, cursor - 1);
    } else if (key === CHECKLIST_KEYS.down) {
      cursor = Math.min(PLATFORM_ADAPTERS.length - 1, cursor + 1);
    } else if (key === CHECKLIST_KEYS.toggle) {
      const platform = PLATFORM_ADAPTERS[cursor]?.name;
      if (platform !== undefined) {
        if (checked.has(platform)) {
          checked.delete(platform);
        } else {
          checked.add(platform);
        }
      }
    } else if (key === CHECKLIST_KEYS.confirm || key === "\n") {
      done = {
        kind: "confirmed",
        platforms: INIT_PLATFORMS.filter((platform) => checked.has(platform)),
      };
      return false;
    } else if (key === CHECKLIST_KEYS.abort) {
      done = { kind: "aborted" };
      return false;
    } else {
      return true; // 词表外键忽略（零状态变化，不重绘）
    }
    io.write(redrawFrame(renderChecklistFrame(checked, cursor)));
    return true;
  });

  return done ?? { kind: "aborted" };
}

/**
 * 从 config.yaml 文本提取当前 profile（无 YAML 依赖的行级解析，容错：缺省 LIGHT）。
 * A1 裁定（2026-09-04）：profile 是信息性人类偏好配置——呈现进入口文件/结果回读，
 * 不作为治理输入（不进 gate/permit 判卷、不决定激活）。
 */
export function parseConfigProfile(configText: string): TriageProfile {
  const match = /^\s*profile:\s*([A-Za-z_-]+)/m.exec(configText);
  const value = match?.[1]?.toUpperCase();
  if (
    value !== undefined &&
    (TRIAGE_PROFILES as readonly string[]).includes(value)
  ) {
    return value as TriageProfile;
  }
  return "LIGHT";
}

const CONFIG_TEMPLATE = `# POMaster vNext 治理配置（pomaster init 生成；人类可编辑，init 不覆盖已存在文件）
version: 1
profile: LIGHT            # 治理档位（信息性人类偏好，A1 裁定 2026-09-04：不进判卷）：MINIMAL | LIGHT | STANDARD
triage:
  ttl_hours: ${TRIAGE_TTL_HOURS}          # triage 结果有效期（C9）
store:
  state: .pomaster/state/truth-index.json
  objects: .pomaster/truth/objects/   # canonical 正文层（宪法 §34-P0；legacy .pomaster/objects/ 禁新写）
`;

// ============================================================
// N7：authority 骨架（BOOTSTRAP 手工步骤自动化）
// ============================================================

/**
 * 项目级默认 owner（单人项目默认形态）：fresh 项目首个对象即可挂本 owner，
 * 无需 BOOTSTRAP 手工登记（theme-demos-report N3/N7：三主题 demo 各手工登记 owner）。
 */
export const BOOTSTRAP_OWNER = "BOOTSTRAP_OWNER";

/** BOOTSTRAP 骨架 owner 的语义注记（owner_registry 条目共用同一常量，字节稳定）。 */
const BOOTSTRAP_OWNER_ROLE_SEMANTICS =
  "项目级默认 owner（BOOTSTRAP 骨架，单人项目默认形态）：一切 authority 位置由项目 Owner 应答；" +
  "细粒度 owner 划分等多人信号出现再演化（Minimum Sufficient Governance）。";

/**
 * authority 骨架（顶层键两段：
 * - kernel 解析契约段：version + authorities（permits.loadAuthorityMap 唯一读取的键；
 *   幽灵 owner=FATAL 的解析源。owner 名 → 元数据，v0 只验存在——与 kernel 测试
 *   BOOTSTRAP 惯例一致取空对象）；
 * - MIG-B1 形态段：owner_registry（至少含项目级 BOOTSTRAP_OWNER）/ boundary_rules（空）/
 *   map（空）——单人项目默认形态；细粒度等多人信号出现再演化（Minimum Sufficient
 *   Governance）。kernel 容忍额外键，读侧不消费。
 * 零墙钟零随机 → 同代码版本字节稳定（A4）。
 */
export function buildSkeletonAuthority(): Record<string, unknown> {
  return {
    version: 1,
    authorities: {
      [BOOTSTRAP_OWNER]: {},
    },
    owner_registry: [
      {
        owner: BOOTSTRAP_OWNER,
        role_semantics: BOOTSTRAP_OWNER_ROLE_SEMANTICS,
      },
    ],
    boundary_rules: [],
    map: [],
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function withMarker(content: string): string {
  return `${GENERATED_MARKER}\n${content}`;
}

/** 重入口安装标记行（doctor 探针判定重入口安装物「应装未装」的机读依据；缺席 = 最小形态）。 */
function withHeavyMarker(content: string): string {
  return `${withMarker(ENTRY_MODE_HEAVY_MARKER)}\n${content}`;
}

/**
 * 从 truth-index（磁盘 snake_case 形态）渲染状态速览计数。
 * 解析失败返回零值占位（调用方已另行告警）；渲染永远字节确定。
 */
function renderStateSummary(index: Record<string, unknown> | null): string {
  const objects = Array.isArray(index?.objects) ? index.objects.length : 0;
  const denominators = Array.isArray(index?.denominators)
    ? index.denominators.length
    : 0;
  const producers = Array.isArray(index?.producers)
    ? index.producers.length
    : 0;
  const generation = index?.generation;
  const seq =
    generation !== null &&
    typeof generation === "object" &&
    typeof (generation as Record<string, unknown>).seq === "number"
      ? (generation as Record<string, unknown>).seq
      : 0;
  return [
    "## 治理状态速览",
    `- objects: ${objects}`,
    `- denominators: ${denominators}`,
    `- producers: ${producers}`,
    `- generation.seq: ${seq}`,
  ].join("\n");
}

// ============================================================
// 入口文件模板（重入口 / 最小指针两形态——平台选择非空 vs none；D13+B7 裁定）
// ============================================================

const COMMON_COMMANDS_LINES = [
  "- `pomaster init` — 补齐/重建治理骨架（幂等；重复执行 NO_CHANGE）",
  "- `pomaster session` — 治理速览投影（SessionStart 注入源；≤10,000 字符硬上限）",
  "- `pomaster alerts` — 可行动项过滤器（permit 到期/CHALLENGED 对象；干净=空输出）",
  "- `pomaster triage \"<request>\"` — 八拍①：秒级判档（MINIMAL/LIGHT/STANDARD）",
  "- `pomaster status --json` — 对象计数 / 分母状态 / permit 活性",
  "- `pomaster context compile --role <role> --json` — 八拍③：最小充分上下文投影",
  "- `pomaster doctor --json` — 内核 / harness MCP 探测（缺什么提示装什么）",
  "- `pomaster check --fast --json` — 八拍⑤：FAST gate（BUILD）",
];

const BROWSER_EYES_LINES = [
  "## Browser Eyes（浏览器双眼）",
  "",
  "- chrome-devtools MCP = 观测眼：诊断「慢/报错/卡住」必须实测（performance trace / network / console），禁只看代码推断。",
  "- playwright MCP = 验证眼：E2E smoke / 交互验证用 playwright 确定性驱动（判卷锚 = @playwright/test 官方报告）。",
  "- 两眼产物（快照/截图/trace/console/network 观测/官方报告）进 BROWSER gate 双通道证据链（GRN / OBS receipt），不停留在聊天记录里。",
  "- 可用性自检：`pomaster doctor --json` 的 chrome_devtools_mcp / playwright_mcp 探针行。",
];

const MACHINE_OUTPUT_LINES = [
  "## 机器可读输出",
  "",
  "一切命令支持 `--json`（§45）；禁止解析彩色自然语言判断状态——机读唯一接口是 JSON 信封。",
];

/**
 * 目录宪法速览（≤10 行节制；两模板共用——.pomaster 目录树 mode 无关。要点蒸馏自
 * 宪法 §0-§12 七平面模型 + §32/§33 Agent 禁令/必令）。
 * Canonical State 表述按宪法 §34-P2 统一：truth-index 是唯一 root index，
 * truth/objects/** 是 Canonical Truth 正文。
 */
const DIRECTORY_CONSTITUTION_LINES = [
  "## 目录宪法速览（.pomaster/ 七平面）",
  "",
  "- state = 控制平面元数据 + sidecars（index/authority/permits/journal/…）",
  "- truth = Canonical Truth 正文（`truth/objects/<kind-slug>/<governed-id>.json` 一对象一文件）",
  "- evidence = 证明（runs/claims/blobs）",
  "- executions + traces = 执行身份与行为档案（durable 进 Git；runtime/traces 为易变层）",
  "- runtime = 易变运行态（sessions/locks/heartbeat，删后可重建）",
  "- discovery = 未确认思考区；memory = 候选记忆 staging；production = 生产反馈",
  "- 禁令：Agent 禁绕过 API 直写 .pomaster；新概念默认是 governed object kind 不是新目录",
  "- 完整规范：`.pomaster/layout.json`（各目录 activation_hint）与 dot-pomaster-directory-constitution.md",
];

/**
 * 最小入口（`--platforms none` 零平台产物形态；静态指针正文，无重入口安装物可述）。
 * 不带重入口安装标记——doctor heavy_entry 探针按「未安装」呈现并指路重跑 init。
 */
function renderMinimalEntryMarkdown(
  profile: TriageProfile,
  stateSummary: string,
): string {
  return `# POMaster vNext — Agent 入口（最小形态）

> 本文件由 \`${INIT_TOOL_ID}\` 的 \`pomaster init\` 生成（\`--platforms none\` 零平台产物形态——静态指针正文，无重入口安装物；重跑 \`pomaster init\`（缺省平台）安装重入口全套）。
> 带生成标记的文件可由 init 重新生成；\`.pomaster/state/truth-index.json\` 是 Canonical State 的唯一 root index，受其引用的 \`truth/objects/**\` 是 Canonical Truth 正文（宪法 §34-P2）。

## 当前治理档位（profile）

- profile: ${profile}（信息性人类偏好，A1：不进判卷）
- triage 结果 TTL: ${TRIAGE_TTL_HOURS}h（过期必须 re-triage，C9）

${stateSummary}

## 常用命令

${COMMON_COMMANDS_LINES.join("\n")}

${DIRECTORY_CONSTITUTION_LINES.join("\n")}

${BROWSER_EYES_LINES.join("\n")}

${MACHINE_OUTPUT_LINES.join("\n")}
`;
}

/** 重入口（重入口默认；skills/hooks 安装物的锚点说明 + 修复路标）。 */
function renderHeavyEntryMarkdown(
  profile: TriageProfile,
  stateSummary: string,
  opts: { readonly claudeSelected: boolean },
): string {
  const claudeBlock = opts.claudeSelected
    ? [
        "- SessionStart 注入：`pomaster session`（治理速览投影，输出 ≤10,000 字符硬上限）——注册于 `.claude/settings.json`（合并式：既有 hooks（含人类/Trellis 条目）一律保留）。",
        "- 每轮轻提醒：`pomaster alerts`（可行动项过滤器；干净=空输出恒 exit 0）——同一文件注册。",
        "",
      ].join("\n")
    : "";
  const mirrorNote = opts.claudeSelected
    ? "与 `.claude/skills/pomaster*/`（Claude Code 必需镜像）逐字节一致"
    : "（claude 平台未选中，未写 `.claude/skills/` 镜像）";
  return `# POMaster vNext — Agent 重入口

> 本文件由 \`${INIT_TOOL_ID}\` 的 \`pomaster init\` 生成（重入口为默认——skills 库 + hook 注入 + 每轮轻提醒）。
> 带生成标记的文件可由 init 重新生成；\`.pomaster/state/truth-index.json\` 是 Canonical State 的唯一 root index，受其引用的 \`truth/objects/**\` 是 Canonical Truth 正文（宪法 §34-P2）；skill 命令卡单一事实源 = \`pomaster --help\`。

## 当前治理档位（profile）

- profile: ${profile}（信息性人类偏好，A1：不进判卷）
- triage 结果 TTL: ${TRIAGE_TTL_HOURS}h（过期必须 re-triage，C9）

${stateSummary}

## 常用命令

${COMMON_COMMANDS_LINES.join("\n")}

${DIRECTORY_CONSTITUTION_LINES.join("\n")}

## 重入口安装物（init 维护）

- skills 命令卡库：\`.agents/skills/pomaster/\` 等 ${SKILL_MANIFEST.length} 份（通用层——Codex/Cursor/Gemini CLI/GitHub Copilot/VS Code/Amp/Warp/OpenCode/Droid 等原生读取），${mirrorNote}。
- 路由入口：\`/pomaster\`（命令全景 + 何时用哪个）；分段卡：pomaster-bootstrap / triage / permit / context / execute / verify / reconcile / compact / closeout / inspect / discovery / catalog / production / runtime。
${claudeBlock}- 修复/重建：重跑 \`pomaster init\`（幂等；缺失镜像重建、hooks 注册项按 command 词形合并，不动人类文件）。

${BROWSER_EYES_LINES.join("\n")}

${MACHINE_OUTPUT_LINES.join("\n")}
`;
}

const CLAUDE_ENTRY_CONTENT = `# POMaster vNext — Claude 入口

Claude harness 入口与 AGENTS.md 共享同一入口（重入口默认，hooks/skills 见 AGENTS.md「重入口安装物」段）：

@AGENTS.md
`;

// ============================================================
// 品牌收尾横幅（人读通道专属）
// ============================================================

/**
 * init 人读输出顶部（一切输出最前）的 ASCII 大字 logo（POMASTER · ANSI Shadow 风格）。
 * 76 列逐字钉位：纯文本零 ANSI 色码，串内无反引号无反斜杠；行内前导/尾随空格属于
 * 版式（末行 71 空格 + VNext、首行尾随 1 空格补齐 76 列），不得 trim。
 * §45 单信封纪律：本段只进人读通道（okOutcome 的 human 行），--json 机读信封恒不含。
 */
const INIT_LOGO_LINES: readonly string[] = [
  "██████╗   ██████╗  ███╗   ███╗  █████╗  ███████╗ ████████╗ ███████╗ ██████╗ ",
  "██╔══██╗ ██╔═══██╗ ████╗ ████║ ██╔══██╗ ██╔════╝ ╚══██╔══╝ ██╔════╝ ██╔══██╗",
  "██████╔╝ ██║   ██║ ██╔████╔██║ ███████║ ███████╗    ██║    █████╗   ██████╔╝",
  "██╔═══╝  ██║   ██║ ██║╚██╔╝██║ ██╔══██║ ╚════██║    ██║    ██╔══╝   ██╔══██╗",
  "██║      ╚██████╔╝ ██║ ╚═╝ ██║ ██║  ██║ ███████║    ██║    ███████╗ ██║  ██║",
  "╚═╝       ╚═════╝  ╚═╝     ╚═╝ ╚═╝  ╚═╝ ╚══════╝    ╚═╝    ╚══════╝ ╚═╝  ╚═╝",
  "                                                                       VNext",
];

/**
 * init 完成输出的收尾段（四产物清单 + profile 之后）：英文哲学横幅 + 联系方式。
 * §45 单信封纪律：本段只进人读通道（okOutcome 的 human 行）——--json 机读信封由
 * toEnvelope 从 result/warnings/errors 组装，恒不含 human 行，文案零污染机读面。
 * 前导空行分隔；各行保持 ~72 列内不溢出（逐字钉位，改动须同步 init.spec.ts）。
 */
const INIT_BANNER_LINES: readonly string[] = [
  "",
  "POMaster · Governed Software State Control Plane",
  "",
  "  State is the only truth. Evidence is the only proof.",
  "  A tool that reports green without evidence is more dangerous",
  "  than no tool at all. Every change is permitted, every claim",
  "  is accounted for, and every fact carries its authority.",
  "",
  "Contact / commercial licensing: allenxujianyang@outlook.com",
];

/**
 * 生成文件统一写盘（marker 生命周期）：缺失 → created；无标记 → skipped_foreign +
 * 告警（绝不覆盖人类文件）；同字节 → unchanged；带标记且异字节 → updated。
 * 入口文件 / skills 命令卡共用同一纪律（clobber 防线单实现）。
 */
async function writeGeneratedFile(
  rootDir: string,
  relative: string,
  content: string,
  files: InitFileReport[],
  warnings: CliWarning[],
  foreignWarningCode: string,
): Promise<void> {
  const absolute = `${rootDir}/${relative}`;
  const existing = await readIfExists(absolute);
  if (existing === null) {
    await ensureParentDir(absolute);
    await writeFile(absolute, content, "utf8");
    files.push({ file: relative, action: "created" });
    return;
  }
  if (!existing.includes(GENERATED_MARKER)) {
    warnings.push({
      code: foreignWarningCode,
      message: `${relative} exists without pomaster generated marker; left untouched`,
      hint: `人工合并后加入标记 ${GENERATED_MARKER} 即可交由 init 维护。`,
    });
    files.push({ file: relative, action: "skipped_foreign" });
    return;
  }
  if (existing === content) {
    files.push({ file: relative, action: "unchanged" });
    return;
  }
  await writeFile(absolute, content, "utf8");
  files.push({ file: relative, action: "updated" });
}

/**
 * layout.json 写盘（预铺布局清单的机器可读面；created/updated/unchanged 三态按字节
 * 比较）。不带 GENERATED_MARKER——HTML 注释破坏 JSON 可解析性；本文件是机器派生
 * 状态（唯一维护者 = init 重生成，内容全部来自 layout.ts 清单常量），人手改动会在
 * 下次 init 被重写（renderLayoutManifest 头注同步声明）。
 */
async function writeLayoutManifestFile(
  rootDir: string,
  files: InitFileReport[],
): Promise<void> {
  const absolute = `${rootDir}/${LAYOUT_MANIFEST_RELATIVE}`;
  const content = renderLayoutManifest();
  const existing = await readIfExists(absolute);
  if (existing === content) {
    files.push({ file: LAYOUT_MANIFEST_RELATIVE, action: "unchanged" });
    return;
  }
  await ensureParentDir(absolute);
  await writeFile(absolute, content, "utf8");
  files.push({
    file: LAYOUT_MANIFEST_RELATIVE,
    action: existing === null ? "created" : "updated",
  });
}

/**
 * 执行 init。幂等：重复执行至第二次起 NO_CHANGE（字节稳定，零写入）。
 * F1：options.platforms 词形原文（undefined = 缺省 claude，现行为）。词形解析
 * 先于一切写盘——非法 fail-closed 零写入。
 */
export async function runInit(
  rootDir: string,
  options: InitOptions = {},
): Promise<CommandOutcome<InitResult>> {
  const warnings: CliWarning[] = [];
  const errors: CliError[] = [];
  const files: InitFileReport[] = [];

  // 0) 词形解析（platforms）：先解析后写盘；非法 → SCHEMA_INVALID 零写入。
  const selection = parsePlatformSelection(options.platforms ?? "claude");
  if (!selection.ok) {
    return failOutcome(
      "init",
      {
        change: "NO_CHANGE",
        tool: INIT_TOOL_ID,
        profile: "LIGHT",
        files: [],
        platforms: [],
      },
      [selection.error],
      [
        "init: FAILED — SCHEMA_INVALID",
        `  ${selection.error.message}`,
        `  hint: ${selection.error.hint}`,
      ],
    );
  }
  const selectedPlatforms = selection.platforms;
  // 重入口产物面 = 平台选择非空（none = 显式最小形态，零平台产物；B7 裁定 2026-09-04：
  // init 单一重入口，无模式旗标）。
  const heavy = selectedPlatforms.length > 0;
  const claudeSelected = selectedPlatforms.includes("claude");

  // 1) 目录骨架：宪法 §2 Target Directory Tree 全量预铺（Owner 2026-09-04 裁定
  //    「把所有的目录全部建好，不分级别」——与入口形态/平台选择无关，恒同一棵树；
  //    激活由 AI 按 layout.json activation_hint 自行判断）。目录清单单源 =
  //    LAYOUT_DIRECTORIES（layout.ts；与 kernel 登记常量守卫对账）。
  // 1.5) legacy layout 检测（宪法 §3 条款 5/6）：.pomaster/objects/ 在场即显式报告
  //      ——禁静默 merge、禁自动覆盖、禁猜测迁移（迁移必须可审计、可回滚，归人类
  //      显式动作；旧 init 空壳残留同样报告，不静默吞）。
  const { mkdir, readdir } = await import("node:fs/promises");
  for (const spec of LAYOUT_DIRECTORIES) {
    await mkdir(`${rootDir}/${POMASTER_DIR}/${spec.path}`, { recursive: true });
  }
  const legacyObjectsAbs = `${rootDir}/${LEGACY_OBJECTS_DIR_RELATIVE}`;
  if (await pathExists(legacyObjectsAbs)) {
    let legacyEntries = 0;
    try {
      legacyEntries = (await readdir(legacyObjectsAbs)).length;
    } catch {
      legacyEntries = -1; // 不可读也显式呈现（禁静默猜测）
    }
    warnings.push({
      code: "LEGACY_OBJECTS_LAYOUT",
      message:
        `legacy layout detected: ${toPosix(LEGACY_OBJECTS_DIR_RELATIVE)}/ exists` +
        (legacyEntries > 0 ? ` with ${legacyEntries} entr${legacyEntries === 1 ? "y" : "ies"}` : legacyEntries === 0 ? " (empty residue of pre-constitution init)" : " (unreadable)"),
      hint: `canonical 正文层已收敛 ${toPosix(TRUTH_OBJECTS_DIR_RELATIVE)}/（宪法 §34-P0）；init 不自动 merge/覆盖/迁移——迁移必须可审计、可回滚，请显式核对后人工处置（或确认无价值后移除本目录）。`,
    });
  }

  // 2) truth-index 空账本：只在缺失时创建；存在但不可解析 → 显式 INVALID_STATE，绝不覆盖。
  const ledgerPath = truthIndexPath(rootDir);
  let ledgerForRender: Record<string, unknown> | null = null;
  if (await pathExists(ledgerPath)) {
    const existing = await readIfExists(ledgerPath);
    if (existing === null) {
      errors.push({
        code: "INVALID_STATE",
        message: `existing truth-index is not readable: ${toPosix(TRUTH_INDEX_RELATIVE)}`,
        hint: "检查文件权限；init 不覆盖已存在账本（clobber 防线）。",
      });
    } else {
      try {
        ledgerForRender = JSON.parse(existing) as Record<string, unknown>;
      } catch (err) {
        errors.push({
          code: "INVALID_STATE",
          message: `existing truth-index is not valid JSON: ${(err as Error).message}`,
          hint: `修复或移除 ${toPosix(TRUTH_INDEX_RELATIVE)} 后重试；init 不覆盖已存在账本。`,
        });
      }
    }
    files.push({ file: toPosix(TRUTH_INDEX_RELATIVE), action: "unchanged" });
  } else {
    const ledger = buildSkeletonLedger();
    ledgerForRender = ledger;
    await ensureParentDir(ledgerPath);
    await writeFile(
      ledgerPath,
      `${JSON.stringify(ledger, null, 2)}\n`,
      "utf8",
    );
    files.push({ file: toPosix(TRUTH_INDEX_RELATIVE), action: "created" });
  }

  // 3) authority 骨架（N7）：只在缺失时创建；存在但不可解析 / 缺 authorities 对象
  //    （kernel loadAuthorityMap 解析契约）→ 显式 INVALID_STATE，绝不覆盖；合法存在
  //    （含人类手工登记的 owner）→ 一律不动（BOOTSTRAP 手改是合法演进）。
  const authPath = authorityFilePath(rootDir);
  if (await pathExists(authPath)) {
    const existing = await readIfExists(authPath);
    let corrupt = false;
    let detail = "";
    if (existing === null) {
      corrupt = true;
      detail = "not readable";
    } else {
      try {
        const parsed: unknown = JSON.parse(existing);
        const authorities = (parsed as Record<string, unknown> | null)?.authorities;
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed) ||
          typeof authorities !== "object" ||
          authorities === null ||
          Array.isArray(authorities)
        ) {
          corrupt = true;
          detail = "authorities 缺失或非对象（kernel loadAuthorityMap 解析契约）";
        }
      } catch (err) {
        corrupt = true;
        detail = (err as Error).message;
      }
    }
    if (corrupt) {
      errors.push({
        code: "INVALID_STATE",
        message: `existing authority.json is corrupt: ${detail}`,
        hint: `修复或从 git 恢复 ${toPosix(AUTHORITY_RELATIVE)} 后重试；init 不覆盖已存在 Authority Map（clobber 防线；幽灵 owner=FATAL 的解析源不可静默重建）。`,
      });
    }
    files.push({ file: toPosix(AUTHORITY_RELATIVE), action: "unchanged" });
  } else {
    const skeleton = buildSkeletonAuthority();
    await ensureParentDir(authPath);
    await writeFile(
      authPath,
      `${JSON.stringify(skeleton, null, 2)}\n`,
      "utf8",
    );
    files.push({ file: toPosix(AUTHORITY_RELATIVE), action: "created" });
  }

  // 4) config.yaml：只在缺失时创建（人类可编辑，永不覆盖）。
  const cfgPath = configPath(rootDir);
  let profile: TriageProfile = "LIGHT";
  const existingConfig = await readIfExists(cfgPath);
  if (existingConfig === null) {
    await ensureParentDir(cfgPath);
    await writeFile(cfgPath, CONFIG_TEMPLATE, "utf8");
    files.push({ file: toPosix(CONFIG_RELATIVE), action: "created" });
  } else {
    profile = parseConfigProfile(existingConfig);
    if (!/^\s*profile:/m.test(existingConfig)) {
      warnings.push({
        code: "CONFIG_PROFILE_MISSING",
        message: "config.yaml has no profile key; falling back to LIGHT",
        hint: `在 ${toPosix(CONFIG_RELATIVE)} 增加 profile: MINIMAL|LIGHT|STANDARD。`,
      });
    }
    files.push({ file: toPosix(CONFIG_RELATIVE), action: "unchanged" });
  }

  // 4.5) 预铺面收尾（宪法 §2 全树已在步骤 1 无条件建出——与入口形态/平台选择无关）：
  //      每目录 README + layout.json 机器清单。位置：config.yaml 之后、入口文件之前
  //      ——README 与 layout.json 先于引用它们的入口内容生成，报告顺序与物理创建顺序一致。
  for (const spec of LAYOUT_DIRECTORIES) {
    await writeGeneratedFile(
      rootDir,
      `${POMASTER_DIR}/${spec.path}/README.md`,
      renderLayoutReadme(spec),
      files,
      warnings,
      "LAYOUT_README_FOREIGN",
    );
  }
  await writeLayoutManifestFile(rootDir, files);

  // 5) 入口文件：AGENTS.md 恒生成（唯一事实源；平台选择非空 = 重入口正文 + heavy
  //    安装标记；`--platforms none` = 最小指针正文，无重入口安装物可描述）。
  //    claude 平台适配器（CLAUDE.md，@AGENTS.md 导入）仅在选中 claude 时参与。
  const entryMarkdown = heavy
    ? renderHeavyEntryMarkdown(profile, renderStateSummary(ledgerForRender), {
        claudeSelected,
      })
    : renderMinimalEntryMarkdown(profile, renderStateSummary(ledgerForRender));
  await writeGeneratedFile(
    rootDir,
    AGENTS_MD_RELATIVE,
    heavy ? withHeavyMarker(entryMarkdown) : withMarker(entryMarkdown),
    files,
    warnings,
    "ENTRY_FILE_FOREIGN",
  );
  if (claudeSelected) {
    await writeGeneratedFile(
      rootDir,
      CLAUDE_MD_RELATIVE,
      withMarker(CLAUDE_ENTRY_CONTENT),
      files,
      warnings,
      "ENTRY_FILE_FOREIGN",
    );
  }

  // 6) 平台段（F1）：registry 顺序逐平台归因。codex = AGENTS.md 原生入口（covered，
  //    零落盘）；claude 的 CLAUDE.md 走步骤 5 既有生命周期，此处只做平台视角归因
  //    （created 之外的文件动作 = 适配器先前已在座 → skipped-existing）；cursor/qoder
  //    适配器（加厚版）缺失时创建；在座文件先做归属判定——带本包生成标记、或字节
  //    等于本包渲染值（含历史细指针形态——旧版项目升级 init 时识别归本包并重写为
  //    加厚版；人类异形内容 → skipped-existing 绝不覆盖）。
  const platforms: InitPlatformReport[] = [];
  for (const spec of PLATFORM_ADAPTERS) {
    if (!selectedPlatforms.includes(spec.name)) continue;
    if (spec.coveredByAgentsMd) {
      platforms.push({ name: spec.name, file: spec.file, action: "covered" });
      continue;
    }
    if (spec.name === "claude") {
      const entry = files.find((f) => f.file === CLAUDE_MD_RELATIVE);
      platforms.push({
        name: "claude",
        file: CLAUDE_MD_RELATIVE,
        action: entry?.action === "created" ? "created" : "skipped-existing",
      });
      continue;
    }
    const absolute = `${rootDir}/${spec.file}`;
    const existing = await readIfExists(absolute);
    if (existing === null) {
      await ensureParentDir(absolute);
      await writeFile(absolute, spec.render(), "utf8");
      platforms.push({ name: spec.name, file: spec.file, action: "created" });
      continue;
    }
    // 归属判定：带本包生成标记，或字节等于本包渲染值（历史版本产物不带标记——
    // 存量细指针 rules 必须可被识别并重写为加厚版；人类手写的异形内容一律
    // skipped-existing 不覆盖）。
    const ours =
      existing.includes(GENERATED_MARKER) ||
      existing === spec.legacyThinRender?.() ||
      existing === spec.render();
    if (!ours) {
      platforms.push({ name: spec.name, file: spec.file, action: "skipped-existing" });
      continue;
    }
    if (existing === spec.render()) {
      platforms.push({ name: spec.name, file: spec.file, action: "skipped-existing" });
      continue;
    }
    await writeFile(absolute, spec.render(), "utf8");
    platforms.push({ name: spec.name, file: spec.file, action: "updated" });
  }

  // 7) 重入口安装物（heavy）：skills 双镜像（marker 生命周期，clobber 防线同入口
  //    文件）+ claude hooks settings.json 读-合并-写回（按 command 词形查重幂等；
  //    坏 JSON/结构不合 → fail-closed 跳过并告警，绝不覆盖不可解析的人类配置）。
  if (heavy) {
    const mirrorDirs: readonly string[] = claudeSelected
      ? SKILL_MIRROR_DIRS
      : [SKILL_MIRROR_DIRS[0]!];
    for (const mirrorDir of mirrorDirs) {
      for (const spec of SKILL_MANIFEST) {
        await writeGeneratedFile(
          rootDir,
          `${mirrorDir}/${spec.name}/SKILL.md`,
          renderSkillMd(spec),
          files,
          warnings,
          "SKILL_FILE_FOREIGN",
        );
      }
    }
    if (claudeSelected) {
      const settingsAbsolute = `${rootDir}/${CLAUDE_SETTINGS_RELATIVE}`;
      const existingText = await readIfExists(settingsAbsolute);
      const merged = mergePomasterHooks(existingText);
      if (merged.status === "skipped") {
        warnings.push({
          code: "HOOKS_SETTINGS_SKIPPED",
          message: `${CLAUDE_SETTINGS_RELATIVE}: ${merged.reason}; hooks 未注册`,
          hint: `修复该文件的 JSON/结构后重跑 pomaster init；init 绝不覆盖不可解析的人类配置（fail-closed）。`,
        });
      } else if (merged.status === "unchanged") {
        files.push({ file: CLAUDE_SETTINGS_RELATIVE, action: "unchanged" });
      } else {
        await ensureParentDir(settingsAbsolute);
        await writeFile(settingsAbsolute, merged.nextText, "utf8");
        files.push({
          file: CLAUDE_SETTINGS_RELATIVE,
          action: merged.status === "created" ? "created" : "updated",
        });
      }
    }
  }

  const created =
    files.some((f) => f.action === "created") ||
    platforms.some((p) => p.action === "created");
  const updated =
    files.some((f) => f.action === "updated") ||
    platforms.some((p) => p.action === "updated");
  const change: InitChange = created ? "CREATED" : updated ? "UPDATED" : "NO_CHANGE";
  const result: InitResult = {
    change,
    tool: INIT_TOOL_ID,
    profile,
    files,
    platforms,
  };

  if (errors.length > 0) {
    return failOutcome(
      "init",
      result,
      errors,
      [
        "init: FAILED",
        ...errors.map((e) => `  ${e.code}: ${e.message}\n    hint: ${e.hint}`),
      ],
      warnings,
    );
  }

  // 人读结构：logo 横幅 → 空行 → 四产物输出 → 平台段 → 入口形态 → profile → 哲学横幅
  // （INIT_BANNER_LINES 自带前导空行）。logo/横幅仅此人读通道；--json 信封恒不受影响
  // （平台段作为结构化 platforms 数组进 result，非横幅文案）。
  const platformLines: string[] = ["  platforms:"];
  if (platforms.length === 0) {
    platformLines.push("    none（--platforms none：未启用任何平台适配器）");
  } else {
    for (const platform of platforms) {
      const note =
        platform.action === "covered" ? "（codex 原生入口，零额外文件）" : "";
      platformLines.push(
        `    [${platform.name}] ${platform.action.padEnd(16)} ${platform.file}${note}`,
      );
    }
  }
  const entryLine = heavy
    ? "  entry: 重入口默认（skills 库 + hooks 注入；修复/重建 = 重跑 pomaster init）"
    : "  entry: 最小形态（--platforms none：零平台产物，无重入口安装物）";
  const human = [
    ...INIT_LOGO_LINES,
    "",
    `init: ${change}`,
    ...files.map((f) => `  ${f.action.padEnd(15)} ${f.file}`),
    ...platformLines,
    entryLine,
    `  profile: ${profile}`,
    ...INIT_BANNER_LINES,
  ];
  return okOutcome("init", result, human, warnings);
}
