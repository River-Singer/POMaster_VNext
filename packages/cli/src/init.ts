/**
 * init.ts —— `pomaster init`：BOOTSTRAP 段的骨架创建与轻入口生成（D13）。
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
 * - AGENTS.md/CLAUDE.md 仅当缺失或带本包生成标记时重写（D13 轻入口）。
 *
 * F1 平台选择：Trellis 惯例——一次 init 覆盖多平台 AI 入口目录。AGENTS.md 恒为唯一
 * 事实源；平台适配器（--platforms 逗号列表）是细指针：
 * - claude → CLAUDE.md（既有 D13 形态，@AGENTS.md 导入；缺省启用 = 现行为）
 * - codex  → 根 AGENTS.md 即 codex 原生入口（零额外文件，呈现 covered）
 * - cursor → .cursor/rules/pomaster.mdc（frontmatter alwaysApply + 细指针正文）
 * - qoder  → .qoder/rules/pomaster.md（frontmatter trigger: always_on + 细指针正文）
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
  QODER_RULES_RELATIVE,
  TRUTH_INDEX_RELATIVE,
  authorityFilePath,
  configPath,
  ensureParentDir,
  objectsDirPath,
  toPosix,
  truthIndexPath,
} from "./store-layout.js";
import { INIT_TOOL_ID, buildSkeletonLedger } from "./digest.js";
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
 * 平台段动作词形：created = 本次新建；skipped-existing = 适配器已在座（一律不覆盖）；
 * covered = 平台原生入口即 AGENTS.md，零额外文件（codex）。
 */
export type InitPlatformAction = "created" | "skipped-existing" | "covered";

export interface InitPlatformReport {
  readonly name: InitPlatform;
  /** 产出/覆盖文件（POSIX 相对路径；codex = 根 AGENTS.md）。 */
  readonly file: string;
  readonly action: InitPlatformAction;
}

export interface InitResult {
  readonly change: InitChange;
  readonly tool: typeof INIT_TOOL_ID;
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

/** 细指针正文（cursor/qoder 适配器共用；标题 + 单行指针，配合 frontmatter 全文 ≤8 行）。 */
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
  /** 适配器内容（细指针；claude 走既有 D13 生命周期，本表仅登记清单呈现）。 */
  readonly render: () => string;
}

/**
 * 平台注册表（数组顺序 = 编号顺序 = 报告顺序）。格式随平台惯例：
 * cursor .mdc 用 description/globs/alwaysApply frontmatter；qoder .md 用
 * trigger: always_on frontmatter（参照本机 Trellis 根多平台目录形态，模仿其形）。
 */
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
        "---",
        "description: POMaster vNext 治理入口（唯一事实源：仓库根 AGENTS.md）",
        "globs:",
        "alwaysApply: true",
        "---",
        "",
        THIN_POINTER_BODY,
      ].join("\n"),
  },
  {
    name: "qoder",
    file: QODER_RULES_RELATIVE,
    coveredByAgentsMd: false,
    render: () =>
      [
        "---",
        "trigger: always_on",
        "---",
        "",
        THIN_POINTER_BODY,
      ].join("\n"),
  },
];

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
  const lines = ["可启用的平台适配器（AGENTS.md 恒生成，为唯一事实源）："];
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

/** 从 config.yaml 文本提取当前 profile（无 YAML 依赖的行级解析，容错：缺省 LIGHT）。 */
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
profile: LIGHT            # 治理档位：MINIMAL | LIGHT | STANDARD（STRICT/CRITICAL 为 P0 prompt_only 候选，C5）
triage:
  ttl_hours: ${TRIAGE_TTL_HOURS}          # triage 结果有效期（C9）
store:
  state: .pomaster/state/truth-index.json
  objects: .pomaster/objects/
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

function renderEntryMarkdown(
  profile: TriageProfile,
  stateSummary: string,
): string {
  return `# POMaster vNext — Agent 轻入口

> 本文件由 \`${INIT_TOOL_ID}\` 的 \`pomaster init\` 生成（D13 轻入口：静态、无运行时依赖、无 hook 注入）。
> 带生成标记的文件可由 init 重新生成；Canonical State 唯一权威在 \`.pomaster/state/truth-index.json\`。

## 当前治理档位（profile）

- profile: ${profile}
- triage 结果 TTL: ${TRIAGE_TTL_HOURS}h（过期必须 re-triage，C9）

${stateSummary}

## 常用命令

- \`pomaster init\` — 补齐/重建治理骨架（幂等；重复执行 NO_CHANGE）
- \`pomaster triage "<request>"\` — 八拍①：秒级判档（MINIMAL/LIGHT/STANDARD）
- \`pomaster status --json\` — 对象计数 / 分母状态 / permit 活性
- \`pomaster context compile --role <role> --json\` — 八拍③：最小充分上下文投影
- \`pomaster doctor --json\` — 内核 / harness MCP 探测（缺什么提示装什么）
- \`pomaster check --fast --json\` — 八拍⑤：FAST gate（BUILD）

## Browser Eyes（浏览器双眼）

- chrome-devtools MCP = 观测眼：诊断「慢/报错/卡住」必须实测（performance trace / network / console），禁只看代码推断。
- playwright MCP = 验证眼：E2E smoke / 交互验证用 playwright 确定性驱动（判卷锚 = @playwright/test 官方报告）。
- 两眼产物（快照/截图/trace/console/network 观测/官方报告）进 BROWSER gate 双通道证据链（GRN / OBS receipt），不停留在聊天记录里。
- 可用性自检：\`pomaster doctor --json\` 的 chrome_devtools_mcp / playwright_mcp 探针行。

## 机器可读输出

一切命令支持 \`--json\`（§45）；禁止解析彩色自然语言判断状态——机读唯一接口是 JSON 信封。
`;
}

const CLAUDE_ENTRY_CONTENT = `# POMaster vNext — Claude 轻入口

Claude harness 入口与 AGENTS.md 共享同一轻入口（D13）：

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

interface FileWritePlan {
  readonly relative: string;
  readonly absolute: string;
  readonly content: string;
  /** true = 仅当缺失或带生成标记时写入；false = 只在缺失时创建。 */
  readonly mayUpdate: boolean;
}

/**
 * 执行 init。幂等：重复执行至第二次起 NO_CHANGE（字节稳定，零写入）。
 * F1：options.platforms 词形原文（undefined = 缺省 claude，现行为）；词形解析先于
 * 一切写盘——非法 fail-closed 零写入。
 */
export async function runInit(
  rootDir: string,
  options: InitOptions = {},
): Promise<CommandOutcome<InitResult>> {
  const warnings: CliWarning[] = [];
  const errors: CliError[] = [];
  const files: InitFileReport[] = [];

  // 0) 平台选择（F1）：先解析后写盘；词形非法 → SCHEMA_INVALID 零写入。
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

  // 1) 目录骨架（state/objects 由 ensureParentDir 与 mkdir 递归创建）。
  const { mkdir } = await import("node:fs/promises");
  await mkdir(objectsDirPath(rootDir), { recursive: true });

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

  // 5) 轻入口（D13）：AGENTS.md 恒生成（唯一事实源）；claude 平台适配器（CLAUDE.md，
  //    @AGENTS.md 导入）走既有 marker 生命周期——仅在选中 claude 时参与。
  const entryMarkdown = renderEntryMarkdown(
    profile,
    renderStateSummary(ledgerForRender),
  );
  const plans: FileWritePlan[] = [
    {
      relative: AGENTS_MD_RELATIVE,
      absolute: `${rootDir}/${AGENTS_MD_RELATIVE}`,
      content: withMarker(entryMarkdown),
      mayUpdate: true,
    },
  ];
  if (selectedPlatforms.includes("claude")) {
    plans.push({
      relative: CLAUDE_MD_RELATIVE,
      absolute: `${rootDir}/${CLAUDE_MD_RELATIVE}`,
      content: withMarker(CLAUDE_ENTRY_CONTENT),
      mayUpdate: true,
    });
  }
  for (const plan of plans) {
    const existing = await readIfExists(plan.absolute);
    if (existing === null) {
      await ensureParentDir(plan.absolute);
      await writeFile(plan.absolute, plan.content, "utf8");
      files.push({ file: plan.relative, action: "created" });
      continue;
    }
    if (!existing.includes(GENERATED_MARKER)) {
      warnings.push({
        code: "ENTRY_FILE_FOREIGN",
        message: `${plan.relative} exists without pomaster generated marker; left untouched`,
        hint: `人工合并后加入标记 ${GENERATED_MARKER} 即可交由 init 维护。`,
      });
      files.push({ file: plan.relative, action: "skipped_foreign" });
      continue;
    }
    if (existing === plan.content) {
      files.push({ file: plan.relative, action: "unchanged" });
    } else {
      await writeFile(plan.absolute, plan.content, "utf8");
      files.push({ file: plan.relative, action: "updated" });
    }
  }

  // 6) 平台段（F1）：registry 顺序逐平台归因。codex = AGENTS.md 原生入口（covered，
  //    零落盘）；claude 的 CLAUDE.md 走步骤 5 既有生命周期，此处只做平台视角归因
  //    （created 之外的文件动作 = 适配器先前已在座 → skipped-existing）；cursor/qoder
  //    细指针适配器只在缺失时创建——已存在一律不覆盖（skipped-existing，幂等纪律）。
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
    if (await pathExists(absolute)) {
      platforms.push({ name: spec.name, file: spec.file, action: "skipped-existing" });
      continue;
    }
    await ensureParentDir(absolute);
    await writeFile(absolute, spec.render(), "utf8");
    platforms.push({ name: spec.name, file: spec.file, action: "created" });
  }

  const created =
    files.some((f) => f.action === "created") ||
    platforms.some((p) => p.action === "created");
  const updated = files.some((f) => f.action === "updated");
  const change: InitChange = created ? "CREATED" : updated ? "UPDATED" : "NO_CHANGE";
  const result: InitResult = { change, tool: INIT_TOOL_ID, profile, files, platforms };

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

  // 人读结构：logo 横幅 → 空行 → 四产物输出 → 平台段 → 空行 → 哲学横幅（INIT_BANNER_LINES
  // 自带前导空行）。logo/横幅仅此人读通道；--json 信封恒不受影响（平台段作为结构化
  // platforms 数组进 result，非横幅文案）。
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
  const human = [
    ...INIT_LOGO_LINES,
    "",
    `init: ${change}`,
    ...files.map((f) => `  ${f.action.padEnd(15)} ${f.file}`),
    ...platformLines,
    `  profile: ${profile}`,
    ...INIT_BANNER_LINES,
  ];
  return okOutcome("init", result, human, warnings);
}
