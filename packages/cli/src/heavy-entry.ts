/**
 * heavy-entry.ts —— 重入口交付面（D13 2026-09-03 修订：重入口默认；B7 裁定 2026-09-04：（锚：corpus/master/cutover/owner-adjudications.md#裁决11⑧）
 * init 单一重入口，早期 `--mode` 双模式旗标已删除）。
 *
 * D13 原裁定 =「重入口默认」：init 无旗标/交互确认/--json 均生成 skills 库 + hook 注入
 * + 加厚平台 rules。B7 裁定（Owner 2026-09-04，vNext Batch 4 R2）删除轻入口退回形态（锚：corpus/master/cutover/owner-adjudications.md#裁决11⑧）
 * ——`--mode` flag、轻入口模板、重→轻移除逻辑（stripPomasterHooks）全部移除，init
 * 单一重入口；`--platforms none` 仍可选（零平台产物形态，入口文件落最小指针正文）。
 * 零运行时第三方依赖的 D13 原 facets 不变——hook 只是 shell form 调 `pomaster` 自身。
 *
 * 三条设计铁律（研究件收敛，research/agents-skills-spec.md + claude-hooks-reference.md）：
 * - 双镜像逐字节一致：Claude Code 只读 `.claude/skills/`（changelog 至 2.1.259 零
 *   `.agents` 支持），Windows symlink 需特权 → 生成实体镜像；OpenCode/Cursor/Warp/Amp
 *   会从两个目录各发现一次同一 skill——逐字节一致 + 同指 `pomaster --help` 单一事实源，
 *   使「哪份被加载」不成为行为分叉点。
 * - frontmatter 标准公共分母：只有 `name`（=目录名，agentskills.io spec 强制）与
 *   `description`（触发语义，唯一路由面）。Claude Code 扩展字段（user-invocable 等）
 *   不写入——双镜像保持逐字节一致且对外分发物零平台方言。
 * - settings.json 合并语义：hook entries 跨 settings 层级自动合并，但同文件需自合并
 *   ——读 → 按命令词形查重 → 追加本包 matcher-group → 写回（保留人类/Trellis 条目）；
 *   坏 JSON/结构不合 → fail-closed 跳过不覆盖（hook 注入 ≤10k 上限、恒 exit 0 的
 *   输出契约由 `pomaster session` / `pomaster alerts` 承担，见 session.ts / alerts.ts）。
 */

import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTEXT_PARTITION_TITLES } from "./context.js";
import { GENERATED_MARKER } from "./store-layout.js";

// ============================================================
// 入口模式标记
// ============================================================

/**
 * 入口模式机读标记（AGENTS.md 首两行之一；doctor 探针据此判定重入口安装物「应装
 * 未装」——标记缺席 = 未安装/最小形态，指路重跑 init，不猜测）。
 */
export const ENTRY_MODE_HEAVY_MARKER = "<!-- pomaster:entry-mode:heavy -->";

/** claude 平台 hook 注册文件（项目级，可提交仓库——团队共享重入口是合法形态）。 */
export const CLAUDE_SETTINGS_RELATIVE = ".claude/settings.json";
/** Codex project hooks use the same matcher-group JSON shape as Claude settings. */
export const CODEX_HOOKS_RELATIVE = ".codex/hooks.json";
export const CLAUDE_EXEC_GUARD_MATCHER = "Edit|Write|NotebookEdit|Bash";
export const CLAUDE_EXEC_GUARD_HOOK_RELATIVE = ".claude/hooks/exec-guard-hook.py";
export const CLAUDE_EXEC_GUARD_LAUNCHER_RELATIVE = ".claude/hooks/pomaster-exec-guard.py";
export const CLAUDE_EXEC_GUARD_COMMAND =
  `python "${CLAUDE_EXEC_GUARD_LAUNCHER_RELATIVE}"`;
export const CLAUDE_EXEC_GUARD_ASSET_RELATIVE = "seeds/hooks/exec-guard-hook.py";

// ============================================================
// hooks 注册（claude/codex 层）：shell form + hook stdin identity adapter + 恒 exit 0 输出契约
// ============================================================

/**
 * 本包 hook 注册清单（事件 → shell form 命令；--hook-input 消费宿主 stdin JSON，
 * Windows 仍走 Git Bash/PowerShell 解析 npm shim；SessionStart matcher 省略 = startup/resume/clear/
 * compact/fork 全形态；UserPromptSubmit 无 matcher 支持、每轮必触发）。
 * 禁用 `if` 字段：非 tool-event hook 上设 if = 永不运行（官方 Hooks Reference）。
 */
export const POMASTER_HOOK_EVENT_COMMANDS: readonly {
  readonly event: string;
  readonly command: string;
  readonly matcher?: string;
}[] = [
  { event: "SessionStart", command: "pomaster session --hook-input" },
  { event: "UserPromptSubmit", command: "pomaster alerts --hook-input" },
  {
    event: "PreToolUse",
    matcher: CLAUDE_EXEC_GUARD_MATCHER,
    command: CLAUDE_EXEC_GUARD_COMMAND,
  },
];

/** Codex has no POMaster write guard adapter; it receives the two context events. */
export const POMASTER_CODEX_HOOK_EVENT_COMMANDS: readonly {
  readonly event: string;
  readonly command: string;
  readonly matcher?: string;
}[] = POMASTER_HOOK_EVENT_COMMANDS.filter((entry) => entry.event !== "PreToolUse");

/** 本包 hook 命令词形闭包（幂等查重与卸载剥离的唯一识别依据）。 */
export const POMASTER_HOOK_COMMANDS: readonly string[] =
  POMASTER_HOOK_EVENT_COMMANDS.map((entry) => entry.command);

/** hook handler 词形（settings.json 落盘形态；type: command + shell form command）。 */
export interface HookHandlerSpec {
  readonly type: "command";
  readonly command: string;
}

/** matcher-group 词形（本包按 hook 定义产出 matcher；既有 group 原样保留）。 */
export interface HookMatcherGroup {
  readonly matcher?: string;
  readonly hooks?: readonly unknown[];
}

/**
 * 合并结果词形：created = settings.json 新建；updated = 追加了本包条目；
 * unchanged = 本包两条 hook 均已在座（幂等重跑零写入）；skipped = 坏 JSON/结构
 * 不合（fail-closed：绝不覆盖不可解析的人类配置，调用方告警留痕）。
 */
export type HooksMergeOutcome =
  | { readonly status: "created" | "updated" | "unchanged"; readonly nextText: string }
  | { readonly status: "skipped"; readonly reason: string };

/**
 * 读-合并-写回（纯函数）：把本包 SessionStart/UserPromptSubmit 注册项并入既有
 * settings.json 文本。按 handler 的 command 词形查重（同文件内重复注册会真重复
 * ——跨文件去重由 Claude Code 处理，同文件去重是安装器的责任）；既有条目
 * （人类/Trellis hooks）一律原样保留；indent 2 + 尾换行写盘格式。
 */
function isManagedPomasterHook(event: string, command: unknown): boolean {
  if (typeof command !== "string") return false;
  const normalized = command.trim().replace(/\s+/g, " ");
  if (event === "SessionStart") {
    return /^(?:npx )?pomaster(?:\.cmd)? session(?: --hook-input)?(?: --json)?$/.test(normalized);
  }
  if (event === "UserPromptSubmit") {
    return /^(?:npx )?pomaster(?:\.cmd)? alerts(?: --hook-input)?(?: --json)?$/.test(normalized);
  }
  return event === "PreToolUse" && (
    normalized === CLAUDE_EXEC_GUARD_COMMAND ||
    normalized === `python ${CLAUDE_EXEC_GUARD_HOOK_RELATIVE}` ||
    normalized === `python "${CLAUDE_EXEC_GUARD_HOOK_RELATIVE}"`
  );
}

function mergeManagedHooks(
  existingText: string | null,
  desired: typeof POMASTER_HOOK_EVENT_COMMANDS,
): HooksMergeOutcome {
  let root: Record<string, unknown>;
  if (existingText === null) {
    root = {};
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(existingText);
    } catch (err) {
      return { status: "skipped", reason: `不是合法 JSON：${(err as Error).message}` };
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { status: "skipped", reason: "顶层不是 JSON 对象" };
    }
    root = { ...(parsed as Record<string, unknown>) };
  }

  const rawHooks = root.hooks;
  let hooks: Record<string, unknown>;
  if (rawHooks === undefined) {
    hooks = {};
  } else if (
    rawHooks !== null &&
    typeof rawHooks === "object" &&
    !Array.isArray(rawHooks)
  ) {
    hooks = { ...(rawHooks as Record<string, unknown>) };
  } else {
    return { status: "skipped", reason: "hooks 键不是对象" };
  }

  let changed = existingText === null;
  for (const { event, command, matcher } of desired) {
    const raw = hooks[event];
    if (raw !== undefined && (raw === null || !Array.isArray(raw))) {
      return { status: "skipped", reason: `hooks.${event} 不是数组` };
    }
    const groups: unknown[] = raw === undefined ? [] : [...(raw as unknown[])];
    for (const group of groups) {
      if (group === null || typeof group !== "object" || Array.isArray(group)) {
        return { status: "skipped", reason: `hooks.${event} 含非对象 matcher-group` };
      }
      const handlers = (group as Record<string, unknown>).hooks;
      if (handlers !== undefined && (handlers === null || !Array.isArray(handlers))) {
        return { status: "skipped", reason: `hooks.${event} matcher-group 的 hooks 字段不是数组` };
      }
    }
    let removedLegacy = false;
    const migratedGroups = groups.map((group) => {
      const record = group as Record<string, unknown>;
      const handlers = ((record.hooks ?? []) as unknown[]).filter((handler) => {
        if (handler === null || typeof handler !== "object") return true;
        const owned = isManagedPomasterHook(event, (handler as Record<string, unknown>).command);
        if (owned && (handler as Record<string, unknown>).command !== command) removedLegacy = true;
        return !owned || (handler as Record<string, unknown>).command === command;
      });
      return handlers.length === ((record.hooks ?? []) as unknown[]).length
        ? group
        : { ...record, hooks: handlers };
    });
    if (removedLegacy) changed = true;
    const alreadyRegistered = migratedGroups.some((group) => {
      const record = group as Record<string, unknown>;
      if (matcher !== undefined && record.matcher !== matcher) return false;
      if (matcher === undefined && record.matcher !== undefined) return false;
      return ((record.hooks ?? []) as unknown[]).some(
        (handler) =>
          handler !== null &&
          typeof handler === "object" &&
          (handler as Record<string, unknown>).command === command,
      );
    });
    if (!alreadyRegistered) {
      const group: HookMatcherGroup =
        matcher === undefined
          ? { hooks: [{ type: "command", command }] }
          : { matcher, hooks: [{ type: "command", command }] };
      migratedGroups.push(group);
      changed = true;
    }
    hooks[event] = migratedGroups;
  }

  if (!changed) {
    return { status: "unchanged", nextText: existingText ?? "" };
  }
  root.hooks = hooks;
  return {
    status: existingText === null ? "created" : "updated",
    nextText: `${JSON.stringify(root, null, 2)}\n`,
  };
}

export function mergePomasterHooks(existingText: string | null): HooksMergeOutcome {
  return mergeManagedHooks(existingText, POMASTER_HOOK_EVENT_COMMANDS);
}

export function mergePomasterCodexHooks(existingText: string | null): HooksMergeOutcome {
  return mergeManagedHooks(existingText, POMASTER_CODEX_HOOK_EVENT_COMMANDS);
}

export function claudeExecGuardAssetCandidates(moduleUrl: string = import.meta.url): readonly string[] {
  return [
    fileURLToPath(new URL("../seeds/hooks/exec-guard-hook.py", moduleUrl)),
    fileURLToPath(new URL("./seeds/hooks/exec-guard-hook.py", moduleUrl)),
  ];
}

export function readClaudeExecGuardHookAsset(
  moduleUrl: string = import.meta.url,
): { readonly path: string; readonly content: string } {
  for (const candidate of claudeExecGuardAssetCandidates(moduleUrl)) {
    if (!existsSync(candidate)) continue;
    return { path: candidate, content: readFileSync(candidate, "utf8") };
  }
  throw new Error(
    `exec-guard hook asset not found (tried: ${claudeExecGuardAssetCandidates(moduleUrl).join(", ")})`,
  );
}

export function resolveCurrentCliEntry(moduleUrl: string = import.meta.url): string | null {
  const argvEntry = process.argv[1];
  if (argvEntry !== undefined && basename(argvEntry) === "bin.js" && existsSync(argvEntry)) {
    return argvEntry;
  }
  const candidates = [
    fileURLToPath(new URL("./bin.js", moduleUrl)),
    fileURLToPath(new URL("../dist/bin.js", moduleUrl)),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function pythonRawString(value: string): string {
  return `r"""${value.replace(/"""/g, '\\"\\"\\"')}"""`;
}

export function renderClaudeExecGuardLauncher(cliEntry: string | null): string {
  const cliLine =
    cliEntry === null
      ? "CLI_ENTRY = None"
      : `CLI_ENTRY = ${pythonRawString(cliEntry.replace(/\\/g, "/"))}`;
  return `#!/usr/bin/env python3
# ${GENERATED_MARKER}
# POMaster generated launcher. Path resolution lives here; permission judgment
# stays in exec-guard-hook.py and the \`pomaster exec-guard\` CLI/kernel.
from __future__ import annotations

import os
import runpy
import sys
from pathlib import Path

${cliLine}
HOOK = Path(__file__).with_name("exec-guard-hook.py")

if CLI_ENTRY is not None and Path(CLI_ENTRY).is_file():
    os.environ.setdefault("POMASTER_CLI_ENTRY", CLI_ENTRY)
os.environ.setdefault("POMASTER_DISTRIBUTED_HOOK", str(HOOK))

if not HOOK.is_file():
    print("[pomaster exec-guard launcher] FAIL-OPEN: distributed exec-guard hook missing", file=sys.stderr)
    sys.exit(0)

runpy.run_path(str(HOOK), run_name="__main__")
`;
}

export function looksLikePomasterExecGuardHook(text: string): boolean {
  return (
    text.includes("exec-guard-hook.py") &&
    text.includes("本脚本零第二判卷逻辑") &&
    text.includes("pomaster exec-guard")
  );
}

// ============================================================
// Skill 库（14 份 × 2 镜像；frontmatter 标准公共分母 name+description；
// 原 pomaster-triage 卡随 D-1/D-5 命令退役删除——裁决 18，① 拍卡=pomaster-discovery）
// ============================================================

/** 单份 skill 清单条目：name=目录名（agentskills.io spec 强制一致）；description 承载触发语义。 */
export interface SkillSpec {
  readonly name: string;
  readonly description: string;
  /** 正文按任务风险提供路由、输入、动作选择、结果判读与交接；命令签名仍以 --help 为准。 */
  readonly bodyLines: readonly string[];
  /** 只有需要浏览器诊断或交互验证的卡片才注入 Browser Eyes。 */
  readonly browserEyes?: boolean;
}

/** 双镜像目录（POSIX 相对路径）。.agents = 通用层（9+ agent 原生读取）；.claude = Claude Code 必需位。 */
export const SKILL_MIRROR_DIRS = [".agents/skills", ".claude/skills"] as const;

/** 命令全景行集（router skill 与 cursor/qoder 加厚 rules 共用；与 pomaster --help 对账钉版）。 */
export const COMMAND_PANORAMA_LINES: readonly string[] = [
  "# 0 BOOTSTRAP —— 建基线 / 速览 / 可行动项 / 装眼睛 / 可移植性 / 自更新",
  "pomaster init",
  "pomaster status",
  "pomaster session        # 治理速览（无子命令形态；SessionStart 注入源，≤10k 字符）",
  "pomaster alerts         # 可行动项过滤器 + workflow 路由段（干净=非空但极简；UserPromptSubmit 源）",
  "pomaster doctor",
  "pomaster portability bootstrap/check",
  "pomaster update --check/--yes",
  "pomaster baseline set/confirm        # set = 单键后补销账；confirm = 基线确认 gate（阻塞集清零后 digest 快照——closeout 阻断码与 doctor/status 确认态的消费源）",
  "",
  "# ① DISCOVERY —— 需求拷问/问题闸/决议图（Brainstorm/Question Gate；D-5，裁决 18）",
  "pomaster brainstorm start/question-gate/status/decide/promote",
  "",
  "# ② FRAMEWORK —— 许可签发/判卷/显式接管/台账",
  "pomaster permit issue/check/steal/list",
  "",
  "# ③ PROJECTION —— 最小充分上下文投影",
  "pomaster context compile/explain",
  "",
  "# ④ EXECUTE —— 写路径机器执行点 / 受控变更",
  "pomaster exec-guard --attempt <file|->",
  "pomaster maintain <change-or-task> --ops <tx>",
  "",
  "# ⑤ VERIFY —— 验证计划编译与执行 / 失败诊断 / 控件数据流审计 / 证据入账",
  "pomaster plan compile --task <TASK.*>",
  "pomaster plan run --task <TASK.*> --execution-id <AGX-n> [--diagnose-on-failure]",
  "pomaster control-data-flow analyze [--report-only]",
  "pomaster finalize status/run <TASK.*> # 自动推进机器步骤；独立 verification / replay / Human ACCEPT 边界显式 pending",
  "pomaster check --fast",
  "pomaster check --gates",
  "pomaster record gate-run/claim",
  "",
  "# ⑥ RECONCILE —— delta 三方对账 / 投影视图 / 审计 / 例外台账",
  "pomaster reconcile --permit <PERMIT.*>",
  "pomaster view blueprint/task",
  "pomaster audit blueprint/task/test-weakening",
  "pomaster ledger record/list",
  "",
  "# ⑦ COMPACT —— 折叠入账 / 知识生命周期 / 记忆收割",
  "pomaster compact",
  "pomaster knowledge search/inspect/record/review-candidates/promote/demote",
  "pomaster memory capture/inspect/harvest/review/promote/audit",
  "",
  "# ⑧ CARRY —— DoD 判卷收口",
  "pomaster closeout <task-id>",
  "",
  "# 横切 —— 对象检视 / 图视图 / Discovery / Research / Eval / Catalog / 迁移 / 生产反馈 / 多 Agent / 执行身份",
  'pomaster resolve "<need>" [--hints ...]',
  "pomaster inspect <governed-id>",
  "pomaster graph <governed-id> [--view impact]",
  "pomaster new-entity check <governed-id> [--need ...]",
  "pomaster research list/inspect/request/handoff",
  "pomaster eval --suite behavioral",
  "pomaster catalog status/explain/relock",
  "pomaster migrate trellis-spec --analyze --spec-root <dir>",
  "pomaster production band/evaluate/challenge/diagnose/metrics/self-improvement",
  "pomaster agents status",
  "pomaster run <task>",
  "pomaster handoff <task> --to <role>",
  "pomaster session attach/refresh/list",
  "pomaster lock acquire/heartbeat/release/steal/list",
  "pomaster execution begin/end/list/audit",
  "pomaster trace show/list",
  "pomaster checkpoint save/show     # 保存或查看恢复所需引用快照；恢复时再用 reconcile 判断新鲜度",
  "pomaster steering record/search   # 登记有来源的约束或检索 steering 事件",
  "pomaster provider capabilities   # 报告 runtime 能力与降级语义；纯读",
  "pomaster telemetry task          # 聚合任务指标及可计算性；纯读、不输出综合评分",
  'pomaster diagnose "<症状>"       # 关联已有证据生成诊断计划；纯读、不自动修复',
];

// ============================================================
// 能力速览内容源（09-06 能力显性化 C1/C2 共享——能力不能静默）（锚：corpus/master/cutover/owner-adjudications.md#裁决16）
// ============================================================

/**
 * 单条能力速览：scene = 场景一句话；command = 确切命令词形（空串 = 非命令出口，
 * 如组件画廊 URL——注册表钉测按在座词形解析，空串条目跳过）；detail = 补充说明。
 * 单一内容源：C1（init 人读横幅 + --json capability_overview）与 C2（AGENTS.md
 * 能力地图节）共用本表，禁第二套能力清单（提示内容与命令注册表钉版防漂移）。
 */
export interface CapabilityEntry {
  readonly scene: string;
  readonly command: string;
  readonly detail: string;
}

/**
 * 能力速览八条（PRD 09-06 Owner 裁定面位 C1：Grill 讨论/基线确认/任务收口/组件画廊/
 * doctor 自检/resolve 标准件选型/graph 对象图/验证计划执行——每次 init 全量展示，不做 NO_CHANGE
 * 精简；D-1/D-5 裁决 18 2026-09-08：原「判档」条随 triage 退役删除，Brainstorm 条
 * 即八拍① 单入口）。command 词形全部在 CLI 注册表在座（tests/capability-surfacing
 * 钉测）；浏览器/人读纪律零 ANSI 纯文本（§45）。
 */
export const CAPABILITY_OVERVIEW: readonly CapabilityEntry[] = [
  {
    scene: "需求要先想清楚再动手（Grill 式讨论）",
    command: "pomaster brainstorm start",
    detail: "讨论驻留 scratchpad，收敛后晋升为任务",
  },
  {
    scene: "技术栈选型敲定后锁定基线",
    command: "pomaster baseline confirm",
    detail: "基线确认 gate；closeout 收口的消费源",
  },
  {
    scene: "任务做完要合规收口",
    command: "pomaster closeout <task-id>",
    detail: "DoD 判卷——acceptance 须映射 VERIFIED claim",
  },
  {
    scene:
      "需要组件形态参考时查画廊（有哪些组件/长什么样；按已确认 baseline 的技术栈选择性查阅）",
    command: "",
    detail: "https://river-singer.github.io/POMaster_VNext/（或仓库内 corepack pnpm studio:dev）",
  },
  {
    scene: "环境是否就绪（工具链/MCP 双眼）",
    command: "pomaster doctor --json",
    detail: "缺什么提示装什么",
  },
  {
    scene: "需求词形先查既有对象与标准件",
    command: 'pomaster resolve "<need>"',
    detail: "NO_MATCH 显式不臆造；解析≠采用",
  },
  {
    scene: "看一个对象的依赖与影响面",
    command: "pomaster graph <governed-id>",
    detail: "--view impact 出影响闭包",
  },
  {
    scene: "按验证计划执行真实工具并审计前端控件数据链",
    command: "pomaster plan run",
    detail: "执行 gate 并写入 GRN；CONTROL_DATA_FLOW 静态结论与运行时确认分层，非绿可自动进入失败诊断",
  },
];

/** C2 能力地图节标题（AGENTS.md 模板与测试共用的单一词形锚）。 */
export const CAPABILITY_MAP_HEADING =
  "## 能力地图（用户能做什么——场景命中时主动转述给用户）";

/**
 * C1 人读行集（init 完成横幅「你现在可以做什么」段；§45 人读通道专属、零 ANSI，
 * 不进 --json 信封 human 之外的任何机读面）。每次 init 全量展示（Owner 09-06 明选，
 * 不做 NO_CHANGE 精简）。
 */
export function renderCapabilityHumanLines(): string[] {
  return [
    "",
    "  你现在可以做什么（能力速览——完整命令面见 pomaster --help）:",
    ...CAPABILITY_OVERVIEW.map((entry) =>
      entry.command === ""
        ? `    - ${entry.scene} → ${entry.detail}`
        : `    - ${entry.scene} → ${entry.command}（${entry.detail}）`,
    ),
  ];
}

/**
 * C2 AGENTS.md 能力地图节（Agent 视角版）：模型读到后在对话中主动转述给用户——
 * 时机点告知面（用户场景命中时），非闲聊推销（PRD Out of Scope 纪律写进节尾注记）。
 * 与「重入口安装物」节不重复：能力地图 = 用户能做什么，安装物 = 装了什么。
 */
export function renderCapabilityMapMarkdownLines(): string[] {
  return [
    CAPABILITY_MAP_HEADING,
    "",
    "以下是本项目已安装的 POMaster 能力（场景 → 命令）。用户表达对应场景时，主动把对应命令转述给用户并引导/代跑；",
    "本节是时机点告知面，禁在无关对话里插广告；完整命令面 = `pomaster --help`。",
    "",
    ...CAPABILITY_OVERVIEW.map((entry) =>
      entry.command === ""
        ? `- ${entry.scene} → ${entry.detail}。`
        : `- ${entry.scene} → \`${entry.command}\`（${entry.detail}）。`,
    ),
  ];
}

/** Browser Eyes 按卡引用；与 AGENTS.md 同源口径。 */
const SKILL_BROWSER_EYES_LINES: readonly string[] = [
  "## Browser Eyes（浏览器双眼）",
  "",
  "- chrome-devtools MCP = 观测眼：诊断「慢/报错/卡住」必须实测（performance trace / network / console），禁只看代码推断。",
  "- playwright MCP = 验证眼：E2E smoke / 交互验证用 playwright 确定性驱动。",
  "- 可用性自检：`pomaster doctor --json` 的 chrome_devtools_mcp / playwright_mcp 探针行。",
];

/** 单一事实源对账段（每份卡片保留；防文档漂移的钉版测试锚 + 双镜像重复发现缓解）。 */
const SKILL_SOURCE_LINES: readonly string[] = [
  "## 单一事实源",
  "",
  "本卡片与 `pomaster --help` 对账（init 钉版测试防漂移）；机读输出一律走 `--json` 信封（§45）。",
  "本文件由 `pomaster init` 生成（重入口 skills 库；重跑 init 即修复/重建）。",
  "",
  "<!-- pomaster:generated -->",
];

/** 卡片装配：frontmatter + 分层正文 + 可选 Browser Eyes + 统一来源段。双镜像共用同一字符串。 */
export function renderSkillMd(spec: SkillSpec): string {
  return [
    "---",
    `name: ${spec.name}`,
    `description: "${spec.description}"`,
    "---",
    "",
    ...spec.bodyLines,
    "",
    ...(spec.browserEyes === true ? [...SKILL_BROWSER_EYES_LINES, ""] : []),
    ...SKILL_SOURCE_LINES,
    "",
  ].join("\n");
}

/** 八拍分段卡公共命令段包装。 */
function commandBlock(lines: readonly string[]): string[] {
  return ["## 命令", "", "```text", ...lines, "```", ""];
}

/**
 * Skill 库清单（14 条目；prd.md「Skill 库」表逐行对应：router + 八拍九段 +
 * 横切四面；D-1/D-5 裁决 18：pomaster-triage 卡删除，八拍① 卡=pomaster-discovery）。
 * description 写用户会自然说出的触发词（harness 自动选路由面），
 * 首句自含完整触发语义（防 listing 截断后失效）。
 */
export const SKILL_MANIFEST: readonly SkillSpec[] = [
  {
    name: "pomaster",
    description:
      "POMaster 项目开发总路由。开始或继续实现、修复 bug、修改既有功能、检查影响、验证交付、恢复会话，或使用 pomaster CLI 时先加载；按当前任务与阶段进入完整 pomaster-* skill，无需用户点名 skill。",
    bodyLines: [
      "# pomaster —— 命令全景路由",
      "",
      "在本项目做开发、检视、验证或恢复时先运行 `pomaster next-action --json`，读取 `workflow_route.required_skill.paths` 指向的完整 SKILL.md，再执行 required_action；不要只看卡名或凭模型记忆继续。若宿主没有动态 hooks，本条就是 agent-pull 入口。",
      "已有会话身份时，每次主动读取和阶段刷新必须使用 `pomaster next-action --session-key <已登记的真实会话键> --json`；hook 返回的 workflow_route.session_key 可复用。宿主 native session_id 不一定等于该键；首次经 `session attach --session-key <key> --harness <host> --meta session_id=<native-id> --meta cwd=<absolute-workspace> --task <TASK.*>` 显式绑定（参数以 session attach --help 为准）。缺身份时使用已明确选定的 `--task <TASK.*>`，多任务必须先选择；不要在后续刷新丢掉身份改跑裸命令。",
      "阶段完成后在同一轮主动重取 next-action、加载下一张完整 skill 并继续；实现交接后必须主动进入 pomaster-verify，不能只说“下一步可以验证”并等待用户再说继续。用户明确只规划、只查状态、暂停或存在真实 Owner/独立主体阻断时才停在授权边界。",
      "用户要求修改既有功能、影响范围未知、恢复后上下文不明或验证失败原因不明时，在 execute/verify 前先完整加载 pomaster-inspect 做只读检视，再返回 workflow_route 指示的主阶段；inspect 是横切前置，不另造第九拍。",
      "",
      "## 命令全景",
      "",
      "```text",
      ...COMMAND_PANORAMA_LINES,
      "```",
      "",
      "## 何时用哪个",
      "",
      "- 0 BOOTSTRAP → pomaster-bootstrap；① 需求拷问 → pomaster-discovery；② 许可 → pomaster-permit；③ 投影 → pomaster-context；④ 执行 → pomaster-execute；⑤ 验证 → pomaster-verify；⑥ 对账 → pomaster-reconcile；⑦ 折叠 → pomaster-compact；⑧ 收口 → pomaster-closeout。",
      "- 横切：检视/图/语义解析 → pomaster-inspect；发现面 → pomaster-discovery；策展物料 → pomaster-catalog；生产反馈 → pomaster-production；多 Agent/执行身份 → pomaster-runtime。",
      "- 会话开场速览：`pomaster session`（无子命令形态，SessionStart 注入源，尾部带首答确认协议）；每轮可行动项：`pomaster alerts`（UserPromptSubmit 源，可行动项过滤器 + workflow 路由段，恒 exit 0）。",
      "- 产物与退出：保存本阶段真实命令结果、任务/AGX/证据引用和阻断；公告“正在使用某 skill”只作说明，不是正文已加载或阶段已完成的证据。",
      "",
    ],
    browserEyes: true,
  },
  {
    name: "pomaster-bootstrap",
    description:
      "POMaster 八拍 0 BOOTSTRAP——建立治理基线与可移植性。当需要初始化/修复治理骨架、查看对象计数与许可活性速览、探测工具链与 MCP 环境、重建运行时平面或自更新 CLI 时使用。",
    bodyLines: [
      "# pomaster-bootstrap —— 八拍 0 BOOTSTRAP",
      "",
      "## 何时用",
      "",
      "- 建立或修复治理基线（幂等，重复执行 NO_CHANGE）。",
      "- 会话开场要看治理状态、要确认工具链/MCP 是否就绪、要自更新 CLI 时。",
      "",
      "先用 `status`/`session` 读取现状；未初始化或生成物缺失时再运行 `init`，环境探针失败时按 `doctor --json` 的 error/hint 修复后复测。`portability` 和 `update` 只在对应迁移或升级目标下执行。",
      "",
      "交付初始化/修复是否实际发生、doctor 尚缺的工具，以及下一张阶段卡；`NO_CHANGE` 表示幂等重放无需重复修复。",
      "",
      ...commandBlock(COMMAND_PANORAMA_LINES.slice(1, 8)),
    ],
    browserEyes: true,
  },
  {
    name: "pomaster-permit",
    description:
      "POMaster 八拍② FRAMEWORK LOCK——写许可生命周期。当需要签发写许可、判卷一次写尝试是否被允许、显式接管过期许可或查看许可台账时使用。",
    bodyLines: [
      "# pomaster-permit —— 八拍② FRAMEWORK LOCK",
      "",
      "## 何时用",
      "",
      "- 写路径开工前签发许可（五件套：身份/Capability/契约引用/范围/验收形状）。",
      "- 判卷写尝试、接管过期许可（--reason 仪式）、审计许可台账。",
      "",
      "## 开工输入",
      "",
      "从已确认的 TASK/CHANGE 与投影中取得 `change_ref`、受控 `subject_ids`、执行主体、Capability 与 acceptance shape。`permit issue` 的 `--subject` 至少一个；重复 issue 会递增新 PERMIT 引用，不是 NO_CHANGE。",
      "",
      "## 动作与结果",
      "",
      "- `issue` 签发许可；保存返回的 `permit_ref`、scope 与 seq 锚，交给 context/execute。",
      "- `check` 判卷单次 subject/op，结果只有 `allowed | denied | expired | unknown_permit`；`PERMIT_SCOPE_DENIED` 表示目标越界，不能换引用绕过。过期检查会留下观察事件。",
      "- `list` 用 change_ref 或 `active | expired | stolen` 找回台账；只有已过期许可才可 `steal`，且必须给出 reason。",
      "",
      "输入形状错误按 error/hint 修正；expired 可显式接管或重新签发，unknown 先查台账。许可通过只说明写尝试可判卷，不代表 context 已编译、变更已写入或验证已完成。",
      "",
      ...commandBlock([
        "pomaster permit issue --subject <governed-id> --actor <type:name> [--change-ref <ref>] [--capability <governed-id>] [--acceptance-shape <json|@file>]",
        "pomaster permit check --permit <PERMIT.*> --subject <governed-id> --op <upsert_object|transition_object|delete>",
        "pomaster permit list [--change-ref <ref>] [--state <active|expired|stolen>]",
        "pomaster permit steal --permit <PERMIT.*> --actor <type:name> --reason <text>",
      ]),
    ],
  },
  {
    name: "pomaster-context",
    description:
      "POMaster 八拍③ PROJECTION——最小充分上下文投影。当需要为某个角色 lane 编译注入上下文、按 capability 过滤 catalog 物料或解释 include/exclude 决策时使用。",
    bodyLines: [
      "# pomaster-context —— 八拍③ PROJECTION",
      "",
      "## 何时用",
      "",
      `- 为角色 lane 取最小充分上下文（${CONTEXT_PARTITION_TITLES.join(" · ")} 五分区——context compile markdown 同名标题，词形与 context.ts 同源闭包）。`,
      "- 需要解释 catalog 物料为何被纳入/排除时（决策面与 Agent Context 严格隔离）。",
      "",
      "准备 `--role`，并从 TASK/CHANGE、permit 与任务事实带入 change、capability、stage/trigger/stack；缺失的事实保持缺席，不猜默认。正常 compile 会写 context manifest，只有 `--check` 是纯读新鲜度检查。",
      "",
      "读取五分区、manifest path、inputs fingerprint 与 stale 状态；`STALE_GROUNDING` 先刷新上游依据后重编译。需要追问某条 catalog 选择时用 explain。把生成 manifest 与角色约束交给 implementer。",
      "",
      ...commandBlock([
        "pomaster context compile --role <role> [--change <TASK|CHANGE>] [--capability <governed-id>] [--stage <stage>] [--check]",
        "pomaster context explain --role <role> [--change <TASK|CHANGE>] [--capability <governed-id>]",
      ]),
    ],
  },
  {
    name: "pomaster-execute",
    description:
      "开始实现功能、修改项目代码、修复 bug 或验证失败后回修时使用 POMaster EXECUTE；先读取任务、适用 spec、context 与 permit，完成实现、自检和结构化交接，再在同一轮进入 verify。",
    bodyLines: [
      "# pomaster-execute —— 八拍④ EXECUTE",
      "",
      "## 何时用",
      "",
      "- 用户说“开始实现”“继续开发”“修复这个问题”或验证确认是产品缺陷时。",
      "- 修改普通源码使用宿主编辑工具；exec-guard 只判受治理写尝试，maintain 只提交治理对象事务。",
      "",
      "## 开工输入",
      "",
      "输入包括当前 selected TASK、完整适用 spec、项目架构、context manifest、实现角色/AGX、permit scope、inspect 结果和验收条件。缺任务或上下文时按 workflow_route 的恢复动作处理，不从聊天猜测。exec-guard attempt 必填 `permit_ref`、`id`、`op`；maintain 只接收治理 Transaction JSON。",
      "",
      "## 选择与判读",
      "",
      "- 只判断一次落笔能否发生：运行 exec-guard。它内容盲、只判卷且不写目标文件；只有 `outcome=allowed` 才通过本次检查。",
      "- 提交治理对象事务：运行 maintain。`APPLIED` 表示返回的对象确实变化；`NO_CHANGE` 是合法幂等出口，不要当失败重试。",
      "- `ATTEMPT_MALFORMED` 修正 JSON；`expired` 回 FRAMEWORK LOCK 显式接管或重签；`unknown_permit` 先查台账；denied/`PERMIT_SCOPE_DENIED` 保留拒绝并回到既有授权流程，不换目标或直写 store。",
      "- 实现代码后运行与改动风险相称的局部检查；未运行或失败如实记录。产品失败继续修复，环境/权限/独立性缺口保持阻断，不把 NOT_RUN 改写成通过。",
      "",
      "产物包含代码改动、局部检查和 `execution handoff` 的 changed paths、summary、known gaps、verification requests。交接只是实现者声明，不等于 VERIFIED。交接成功后同一轮重取 next-action，完整加载 pomaster-verify 并执行验证；不得等待用户再发消息。",
      "",
      ...commandBlock([
        "pomaster exec-guard --attempt <file|-> --json",
        "pomaster maintain <change-or-task> --ops <tx-file> [--execution-id <AGX-n>] --json",
        "pomaster execution handoff <AGX-*> --task <TASK.*> --changed <path> --summary <text> [--check <text>] [--known-gap <text>] [--verify <text>] --json",
      ]),
    ],
  },
  {
    name: "pomaster-verify",
    description:
      "实现交接完成、用户要求检查/验收、交付前确认或修复后复测时使用 POMaster VERIFY；按任务编译并真实执行验证计划，判读失败与能力缺口，保留证据并按真实 finalize 阶段退出。",
    bodyLines: [
      "# pomaster-verify —— 八拍⑤ VERIFY",
      "",
      "## 何时用",
      "",
      "- 默认 N5 闭环：plan compile → 静态+runtime CDF 双 GRN与统一 diagnostics → finalize run → replay-against-spec/独立 verification/Human ACCEPT pending → closeout。",
      "- `CONTROL_DATA_FLOW` 由受信静态 analyzer 产出；静态 unknown 与运行时确认候选必须分层呈现，禁止把候选冒充已验证。",
      "- 内循环自检（FAST gate，BUILD 腿，纯读）或全 gate recipes 派发；把 gate 运行结果 / claim 显式落账 evidence 平面（GRN/CLM 收据）。",
      "- execute 产生 fresh implementation handoff 后无需用户再提醒，本轮立即加载本 skill 并开始验证。",
      "",
      "## 开工输入",
      "",
      "从 workflow_route 取得 selected TASK、fresh implementation handoff、required actor/action；读取 TASK acceptance、完整适用 spec、架构/context、changed paths 与 known gaps。验证 AGX 必须绑定该任务并遵守独立性边界；不能拿 implementation AGX 冒充独立 verifier。",
      "",
      "## 执行与判读",
      "",
      "1. compile 检查每条 acceptance 的 applicability、resolved bindings 与 diagnostics；unknown 保留，缺工具不是 N/A。",
      "2. run 只串行执行 REQUIRED obligations 并逐项写 GRN；只有全部 passed 才成功，且不会自动创建 claim、verification 或 closeout。工具缺席/未执行是显式 NOT_RUN（JSON `verdict=not_run`），不是绿色。",
      "3. 前端交互变更用 control-data-flow 静态报告配合浏览器 runtime confirmation；静态 proven 不证明真实 API、持久化或回显。",
      "4. `finalize status` 读取当前阶段；`finalize run` 可重入推进机器验证，但独立 replay、独立 verification 与 Human ACCEPT 缺失时返回 pending 和 next_actions，禁止代签。",
      "5. 验证链满足后加载 pomaster-reconcile，按当前 permit 对账并判读漂移；再按路由进入 compact/closeout。reconcile 不能替代验证，也不能自行接受漂移。",
      "",
      "失败恢复按 diagnostics 分类：确认的产品缺陷转 pomaster-execute，工具/环境缺失修绑定或保持 NOT_RUN，输入漂移重新 inspect/context/handoff，权限与独立主体缺失保持 pending。只重跑受影响步骤，保留 partial GRN。产物包括 plan fingerprint、每项 verdict、证据引用和 pending actor/action；退出条件以 finalize 真实阶段为准，再主动重取 next-action 进入 reconcile/closeout 或准确停在人工边界。",
      "",
      ...commandBlock([
        "pomaster plan compile --task <TASK.*>",
        "pomaster plan run --task <TASK.*> --execution-id <AGX-n> --diagnose-on-failure",
        "pomaster control-data-flow analyze [--report-only]",
        "pomaster finalize status <TASK.*>",
        "pomaster finalize run <TASK.*> --verification-execution-id <AGX-*> --review-range <range> [--verifier <type:name>] [--replay-receipt <sha256>]",
        "pomaster check --fast",
        "pomaster check --gates",
        "pomaster record gate-run --from <file> [--execution-id <AGX-n>]",
        "pomaster record claim --from <file> [--execution-id <AGX-n>]",
        "pomaster record verification --clm <CLM-n> --verifier <type:name> --evidence <ref> [--execution-id <AGX-n>]",
      ]),
    ],
    browserEyes: true,
  },
  {
    name: "pomaster-reconcile",
    description:
      "POMaster 八拍⑥ RECONCILE——delta 对账与审阅面。当需要按许可基线出三方 delta 报告、查看叙事/审查投影视图、逐字段审计对象或登记/查看异常台账时使用。",
    bodyLines: [
      "# pomaster-reconcile —— 八拍⑥ RECONCILE",
      "",
      "## 何时用",
      "",
      "- 实现完成后按许可基线出 delta（changed/exceptions/samples）给人审。",
      "- 看叙事视图/审查视图/七字段审计/异常台账。",
      "",
      "从执行链取得 permit 引用并运行 reconcile。`clean=true` 是合法零差异；changed/exceptions 会返回 dirty 与审阅样本，保留结果供人工审查。dirty 不是扩权理由，按报告修复或登记有依据的 exception 后重跑。",
      "",
      "用 view 看叙事/审查投影，用 audit 查字段或测试削弱，用 ledger 记录已获授权的异常分类。交付 delta、exceptions、sample 与尚未裁定项后再进入 compact。",
      "",
      ...commandBlock([
        "pomaster reconcile --permit <PERMIT.*>",
        "pomaster view blueprint/task",
        "pomaster audit blueprint/task/test-weakening",
        "pomaster ledger record/list",
      ]),
    ],
  },
  {
    name: "pomaster-compact",
    description:
      "POMaster 八拍⑦ COMPACT——折叠入账与知识记忆面。当需要把证据平面与事务折叠为单次 store 事务、检索/登记/提升知识条目或收割评审 harness 记忆时使用。",
    bodyLines: [
      "# pomaster-compact —— 八拍⑦ COMPACT",
      "",
      "## 何时用",
      "",
      "- episode 折叠：证据批量收编 + 显式事务合并为单次 applyTransaction（NO_CHANGE 合法出口）。",
      "- 经验入库（knowledge 生命周期）与 harness 记忆收割评审。",
      "",
      "确认本轮 runs/claims 与可选事务文件属于同一 episode，再运行 compact；默认收编证据，只有明确需要时使用 `--no-ingest`。畸形证据以 warning 保留且不阻断其余折叠，必须在交付中列出，不能冒充已收编。",
      "",
      "`APPLIED` 表示单次 store 事务产生变化，`NO_CHANGE` 是合法出口。knowledge/memory 的 promote 只走各自命令与审查边界；折叠完成后把 seq、warnings 与未处理项交给 closeout。",
      "",
      ...commandBlock([
        "pomaster compact",
        "pomaster knowledge search/inspect/record/review-candidates/promote/demote",
        "pomaster memory capture/inspect/harvest/review/promote/audit",
      ]),
    ],
  },
  {
    name: "pomaster-closeout",
    description:
      "POMaster 八拍⑧ CARRY——DoD 判卷收口。当需要判定任务完成（acceptance 与 VERIFIED claim 硬绑 + gate 记录全过）并对合规任务施断 COMPLETED 时使用；证据缺失伪装完成会被硬阻断。",
    bodyLines: [
      "# pomaster-closeout —— 八拍⑧ CARRY",
      "",
      "## 何时用",
      "",
      "- 任务收口：DoD 判卷（逐条 acceptance 映射 VERIFIED claim）+ 阻断施断。",
      "",
      "## 开工输入",
      "",
      "使用 TASK governed id，并先确认 acceptance 非空、每条映射到当前 claim、必需 gate 与绑定 Evidence Spec 已满足，独立 verification 已入账且 Human ACCEPT 回执有效。输入来自 task、GRN/CLM evidence 与 finalize status，不手工改收据。",
      "",
      "## 判读与恢复",
      "",
      "`COMPLETED` 才表示施断成功；已完成任务重放保持完成。缺 claim、未 VERIFIED、gate 未通过、baseline 漂移、独立性冲突或 Human ACCEPT 缺失/损坏/过期都会 pending/阻断，并保留具体 error/hint。可选 gate 未过只在明确排除且非 required 时降为诊断提醒。",
      "",
      "按错误回 verify/finalize 生成新证据或等待对应独立主体/Owner；不得覆写旧 claim、把 NOT_RUN 改绿或由编排器代签。交付最终状态、阻断码与下一责任人。",
      "",
      ...commandBlock(["pomaster closeout <task-id>"]),
    ],
  },
  {
    name: "pomaster-inspect",
    description:
      "修改既有功能前分析影响、不了解当前实现、验证失败需要归因、恢复后上下文不明，或需要检视对象/依赖图/语义解析时使用 POMaster INSPECT；纯读收集源码与治理证据后返回原阶段。",
    bodyLines: [
      "# pomaster-inspect —— 横切检视",
      "",
      "## 何时用",
      "",
      "- 修改已有功能前先定位实现、调用方、数据流、约束、测试与潜在影响；恢复后或错误归因不明时先检视。",
      "- 检视单对象、对象图/影响闭包；需求词形先解析再决定是否新建（NO_MATCH 显式不臆造）。",
      "",
      "输入是 selected TASK、用户意图、已知 changed paths、项目架构与有效旧检视引用。先搜索实际源码和配置，再用 governed id 做 inspect/graph；只有自然语言 need 时才 resolve。结果必须区分 observed、inferred 与 unknown。对象不存在、NO_MATCH、动态图边或证据过期都如实保留。",
      "失败时扩大只读证据面或回 context/discovery 请求缺失决定，禁止为了让路由前进而编造 governed id。产物是受影响文件/对象、依赖与风险、证据引用和 unknowns；若输入仍新鲜可复用。完成后返回原阶段，把结果传给 context/execute/verify，而不是把 inspect 当第九拍。",
      "",
      ...commandBlock([
        "pomaster inspect <governed-id>",
        "pomaster graph <governed-id> [--view impact]",
        'pomaster resolve "<need>" [--hints ...]',
      ]),
    ],
  },
  {
    name: "pomaster-discovery",
    description:
      "用 Grounded Brainstorm 把含糊需求收敛为可晋升的 scoped Decision Graph。当用户要讨论需求、澄清想法、规划新功能、比较方案或补研究证据时使用；从 brainstorm start 进入，覆盖先 Ground 后 Grill、Question Gate、frontier、research 与 promote。",
    bodyLines: [
      "# pomaster-discovery —— 发现面（Grounded Brainstorm 方法论）",
      "",
      "把「走 pomaster brainstorm」接到可落盘的 Discovery 平面上：讨论驻留 scratchpad（Ephemeral 纪律），拷问产出 **Decision Graph**（不是一串独立问题），收敛与晋升由机器判卷——本卡是方法论剧本 + 命令链，判卷权威全部在 kernel 与 `pomaster --help`（单一事实源）。",
      "",
      "## 何时用（触发词面）",
      "",
      "- 需求讨论 / 想法澄清 / brainstorm / 怎么规划 / 新功能探索 / 拷问需求——用户想先把问题想清楚，而不是直接改代码。",
      "- 需求含糊或有多种可行路径、权衡未定（范围/可靠性/成本）、用户自己也不知道最佳选项。",
      "- 横切：research 产物判读（五级 Evidence）；Agent 行为评测（fail-closed）。",
      "",
      "## 第一层 · 方法论主轴：Grill Strategy（先 Ground 后 Grill）",
      "",
      "### Grill 的输入不是 User Prompt",
      "",
      "拷问之前先 Ground。Grill 的输入清单（缺一项先补一项，不凭空开问）：",
      "",
      "1. Intent（用户意图——`brainstorm start --prompt` 登记 raw prompt 原文，禁 Raw Prompt → Task → Code）；",
      "2. Discovery Projection（发现投影——`decide --set` 时申报 G2 检索面）；",
      "3. 既有 Decision Graph（`decision-graph.json`——从既有决议出发，不推翻未失效结论）；",
      "4. Exceptions（例外台账——已知冲突与假设先看，不重复拷问）；",
      "5. Research Findings（research artifact findings——已取证的事实不再问人）；",
      "6. Relevant Evidence（证据平面——GRN/CLM 收据）。事实型问题禁止问 Human：Current Truth / Docs / Repo / Evidence 能答的自己查，查不到标缺失事实走 Research。",
      "",
      "### 九类拷问动作（只做这些，不得因「可能有用」扩 Scope）",
      "",
      "- Expose Hidden Decision（暴露隐藏决策——用户没意识到自己正在做的选择）",
      "- Expose Hidden Assumption（暴露隐藏假设）",
      "- Expose Dependency（暴露依赖——这个决定取决于哪个先决决定）",
      "- Expose Conflict（暴露冲突——蓝图/原型/仓库各执一词时禁自行挑答案）",
      "- Expose Reversibility Boundary（暴露可逆性边界——错了能不能退）",
      "- Expose Failure Behavior（暴露失败行为）",
      "- Expose Authority Boundary（暴露权威边界——这题谁有权答）",
      "- Expose Acceptance Gap（暴露验收缺口）",
      "- Expose Evidence Gap（暴露证据缺口——哪个前提还没有 Ref）",
      "",
      "### 拷问的价值在发现值得答的问题",
      "",
      "Grill does not ask more questions. It discovers the questions worth answering——拷问的价值在发现值得回答的问题，不在问题数量。每个候选问题过 Question Gate（Q1-Q7）后才允许问人：事实型 → Truth/Repo/Evidence；技术可研究 → Research；可逆低风险 → Recommended Default + ASSUMPTION；不影响本增量 → DEFER；只有 Authority/Preference 类才 ASK_HUMAN。",
      "",
      "### Frontier 节奏：每轮只打当前 frontier",
      "",
      "每轮只处理当前 Frontier（prerequisites 已满足且有资格被处理的 Decision 集合，`decide --set/--answer` 输出实时呈现）——绝不一次甩 20 个待确认。上游决议后 frontier 自然推进；waiting 里的节点附未满足依赖明细。与一次一问天然相容。",
      "`decision_scope` 由 `root_decision_ids` 与当前 `graph_fingerprint` 组成，范围包含根节点的传递依赖；scope 外独立 OPEN 节点继续可见但不阻塞本次 ready/promote。图变更后旧 scope 失效，必须基于新 fingerprint 重判。",
      "",
      "### Upstream Change Invalidation（上游改动 → 下游失效）",
      "",
      "上游决策被改写（--answer 重开/CHANGE 新选项）时，依赖它的下游结论不得继续当作已解决——主动提示受影响 Decision 需要重开与重 grounding，禁「改了 D1 还沿用 D2-D4 的旧答案」。同理：Decision 依赖的 Truth/Contract/Research Finding 更新后必须重新 Ground。",
      "",
      "### 核心产物是 Decision Graph",
      "",
      "拷问产出节点化的 Decision Graph（DAG：depends_on/affects + grounding 十键 + options + recommendation + resolution），不是聊天记录里的一串问题。候选图必须经 kernel buildDecisionGraph 入图（环/悬空依赖/无 basis 推荐/禁词一律拒）；发现的候选问题必须过 Question Gate 联结（question-gate 命令）。",
      "",
      "### 九类拷问动作 × 机器承载对照（行为 → 落盘）",
      "",
      "| Expose 动作 | 图上承载 | 机器判卷位 |",
      "|---|---|---|",
      "| Hidden Decision | 新增 DECISION.* 节点（class/prompt/options） | decide --set（buildDecisionGraph） |",
      "| Hidden Assumption | recommendation.source=INFERENCE 披露 / --assume 申报 | G7 + question-gate ASSUMPTION |",
      "| Dependency | depends_on 边（DAG） | frontier 计算（环/悬空拒） |",
      "| Conflict | grounding.conflicts 披露条目（refs ≥2） | G5 → CONFLICT_REVIEW（禁自行挑答案） |",
      "| Reversibility Boundary | options 词形（DEFER 通道）+ --defer 决议 | §15 合法残留 DEFERRED_DECISION |",
      "| Failure Behavior | prompt/options 文面 + recommendation.tradeoff | G7 可追溯性 |",
      "| Authority Boundary | authority.owner（SCREAMING_SNAKE） | G8（谁有权答才许问人） |",
      "| Acceptance Gap | affects 引用 + --acceptance 挂锚申报 | §15 msd 三轴（文本非空派生）+ 锚存在性判卷 |",
      "| Evidence Gap | grounding.missing_facts（FACT.* 词形） | G6 路由 → research request/handoff |",
      "",
      "### Question Gate 处置速查（Grill 与 Gate 的联结）",
      "",
      "- ASK_HUMAN：只有 BLOCKING_AUTHORITY / PREFERENCE 两类申报可问人（七关 Q1-Q7 全过）——一次一问。",
      "- DERIVABLE / RESEARCHABLE：事实型与技术可研究问题禁止问人——自己去 Truth/Repo 查，或派 research。",
      "- DEFERABLE：不阻塞当前 Increment——显式延后（--defer / --residual），不假装已解决。",
      "- ASSUMPTION：Q7 不阻塞 + 五条件全申报（low_risk/reversible/within_permit/no_authority_conflict/acceptance_testable）——登记 ledger record --classification ASSUMPTION，不伪装 Truth。",
      "- ASK_REJECTED：七关全过却申报了不可问类——fail-closed 打回，不许绕闸开口。",
      "",
      "## 第二层 · 对话形式纪律",
      "",
      "- **task-first**：先建/找到 Discovery（brainstorm start）再聊——想法立刻入 scratchpad，不悬在对话里。",
      "- **先查后问**：repo 可查的不问 Owner——代码/配置/文档/OpenAPI 自己读；这是 Question Gate Q1-Q5 的行为面。",
      "- **一次一问**：每条消息只问当前 frontier 上价值最高的一个问题（question-gate 的 One-question-at-a-time）；偏好题先给 2-3 个带代价的具体选项。",
      "- **research-first**：技术选型类问题先派 research sub-agent 取证（外部专有名词必须联网核实，禁凭训练数据推测），再带证据回来出选项；缺口登记成 RESEARCH.REQ.* 走机器链（见下）。",
      "- **converge → MVP**：发散（未来演化/相邻场景/失败边界）之后显式收敛——MVP 边界内进 Requirements，边界外显式 Out of Scope（--defer/--residual 是它的机器承载）。",
      "",
      "Anti-patterns（硬避免）：问 repo 能查到的；没给选项就让用户挑；问「要不要我搜索」这类 meta 题；只守初始请求不看演化与边界；聊完不落盘（图形同虚设）。",
      "",
      "## 任务生命周期全图（从想法到收口）",
      "",
      "```text",
      "discovery 阶段（本卡）",
      "  brainstorm start → question-gate → decide --set → --answer（→ research request/handoff 消解缺口）→ decide --ready",
      "  → brainstorm promote --apply —— promote 即建任务：store 出现 TASK.*/CHANGE.* 治理对象",
      "research 阶段（随任务/讨论挂宿主）",
      "  research <topic> 骨架 → research request 发起 → research handoff 回填 → decide --ready 重判",
      "八拍（对 promote 出的 TASK/CHANGE 跑）",
      "  ② permit issue（--change-ref 绑定任务）→ ③ context compile → ④ exec-guard/maintain",
      "  → ⑤ plan compile/run + finalize（独立验证与 Human ACCEPT 可显式 pending）→ ⑥ reconcile → ⑦ compact → ⑧ closeout",
      "```",
      "",
      "模型从本图应看到整条任务驱动链：讨论在 Discovery 平面收敛，promote 是「想法 → 治理对象」的唯一入口，八拍是「治理对象 → 证据化完成」的机器通路。",
      "",
      "## 行为纪律 vs 机器闸（分工）",
      "",
      "- **拷问是模型行为**：Ground、九类 Expose、frontier 节奏、一次一问——模型按本卡执行，不产生机器记录。",
      "- **落盘与判卷是机器**：候选图入闸（buildDecisionGraph）、决议录入（resolveDecision）、收敛判定（evaluateDiscoverySufficiency）全部 kernel 判卷。`decide --ready` 不足照样 fail-closed——模型自评「聊得差不多了」不放行，缺口逐条列出；state 零变更。",
      "- 模型不私造判卷：不手写 decision-graph.json 的 resolution、不绕过 question-gate 直接问人、不绕过 promote 直写 store。",
      "",
      "## 第三层 · 机器闸（命令链）",
      "",
      ...commandBlock([
        "pomaster brainstorm start --id <id> --prompt \"<raw>\" [--ephemeral]",
        "pomaster brainstorm question-gate <id> --category <分类> --q1 <bool> … --q7 <bool> [--assume <条件>]",
        "pomaster brainstorm decide <id> --set <candidates.json> --retrieved <面> --route <FACT.*>=<DERIVABLE|RESEARCHABLE>",
        "pomaster brainstorm decide <id> --answer <DECISION.*> --accept|--value <option>|--unknown --triage <key=bool>|--defer",
        "pomaster research request <id> --decision <DECISION.*> --proposition \"<text>\" --why \"<text>\" --evidence <级> --mode <模式>|--gap <类> --stop-when \"<text>\" --forbid \"<text>\"",
        "pomaster research handoff <id> --file <handoff.json>",
        "pomaster brainstorm decide <id> --ready [--decision-root <DECISION.*>] --goal <text> --scope <text> --acceptance <criterion>@<DECISION.*|ASSUMPTION:EXC-*> [--residual <分类>:<陈述>]",
        "pomaster brainstorm promote <id> --to TASK|CHANGE --basis msd_reached --apply",
      ]),
      "",
      "### 链上各闸做什么",
      "",
      "1. `brainstorm start`：创建 scratchpad 进 DISCOVERY 态；--prompt 登记 raw prompt，--known/--unknown/--conflict/--assumption 登记 Intent Framing 四分拣。",
      "2. question-gate：七问判卷（ASK_HUMAN/DERIVABLE/RESEARCHABLE/DEFERABLE/ASSUMPTION/ASK_REJECTED）——每问先过闸再开口；ASSUMPTION 联动 ledger record 登记，不伪装 Truth。",
      "3. `decide --set`：候选图载入（§5.2 十键节点）+ 全节点 grounding 判定呈现（G1-G8）+ frontier 呈现；图落 decision-graph.json；--retrieved 申报 G2 检索面、--route 申报缺失事实路由。",
      "4. `decide --answer`：逐决策应答（KNOWN 已含于 --accept/--value；UNKNOWN 六问重分类；--defer 显式延后）；仅 READY_FOR_DECISION 节点可答；同决议重放幂等。",
      "5. `research request` → `research handoff`：NEEDS_RESEARCH 缺口的公开消解——请求落档 index.yaml 并同步图侧标记；handoff 把 finding 挂回节点（RESOLVES_FACT 消解 missing_facts；CONTRADICTS_PREMISE 只披露不裁决）；消解方由 Owner 指定。",
      "6. `decide --ready`：缺省按全图判卷；只在增量收敛时用可重复的 `--decision-root` 声明 decision_scope，使判卷只要求该 scope 及其传递依赖满足 MSD 三轴与合法残留，scope 外节点继续可见。全绿写 READY_TO_PROMOTE，不足 fail-closed 列缺口且状态零变更。",
      "7. `promote --apply`：提升走 P11 maintain 面落库（Discovery 层不私造第二写入通道）——promote 即建 TASK.*/CHANGE.*，随后进八拍。",
      "",
      "### 横切检视（发现面）",
      "",
      ...commandBlock([
        "pomaster brainstorm status",
        "pomaster research list <task-or-discovery>",
        "pomaster research inspect <host>/research/",
        "pomaster eval --suite behavioral",
      ]),
      "",
      "research artifact 判读语义：五级 Evidence（AUTHORITATIVE/PRIMARY/IMPLEMENTATION/SECONDARY/INFERENCE）；CONFLICTS 是发现不是裁决——上报正式治理面，Research 无权改判 Authority。",
      "",
      "## 一轮 Grill 的样例拍序（把三层串起来）",
      "",
      "```text",
      "拍 0 Ground    读 Intent/Repo/Docs/Evidence/既有图（先查后问）——brainstorm start --prompt 登记原文",
      "拍 1 Expose    发现「排序方式其实是隐藏决策」→ 起草 DECISION 节点（九类动作之一）",
      "拍 2 Gate      question-gate 七问 → RESEARCHABLE（技术可研究，禁止问人）",
      "拍 3 Set       decide --set 候选图 + --route FACT.X.Y=RESEARCHABLE → verdict=NEEDS_RESEARCH",
      "拍 4 Research  research request 发起 → 消解方（Owner 指定）取证 → research handoff 回填",
      "拍 5 Ask       重算 READY_FOR_DECISION 后一次一问：给 2-3 个带代价的选项 → --answer 录入",
      "拍 6 Move      frontier 推进（上游 ACCEPT/CHANGE 后下游入场）→ 回到拍 1，直到当前 decision_scope 收敛",
      "拍 7 Converge  decide --ready（增量时追加 --decision-root）→ 全图或 scoped 判卷全绿 → promote --apply 建任务",
      "```",
      "",
      "拍序纪律：每拍完成后把图、决议或请求落成可恢复检查点，并在同一轮继续推进当前 frontier；只有等待外部输入、授权或独立研究结果时才暂停。机器拒绝时按 error/hint 修输入后重跑，禁绕闸。",
      "",
    ],
  },
  {
    name: "pomaster-catalog",
    description:
      "POMaster 策展物料面——Engineering Catalog 与规范迁移。当需要查看 catalog 构成、解释单条策展物料、漂移重锁（relock）或分析 Trellis spec 目录的迁移分类时使用。",
    bodyLines: [
      "# pomaster-catalog —— 策展物料面",
      "",
      "## 何时用",
      "",
      "- 查看 catalog 构成/解释条目；catalog-lock 漂移的恢复键是 relock。",
      "- Trellis spec 迁移先分析不落盘（analyze-only）。",
      "",
      "先用 status/explain 纯读定位条目或 lock drift；只有确认要接受当前 catalog 字节时才 relock。迁移命令保持 `--analyze`，将分类报告交给实际迁移任务。",
      "",
      ...commandBlock([
        "pomaster catalog status/explain/relock",
        "pomaster migrate trellis-spec --analyze --spec-root <dir>",
      ]),
    ],
  },
  {
    name: "pomaster-production",
    description:
      "POMaster 生产反馈面——控制带与状态挑战闭环。当需要定义 control band、判定生产观测是否击穿、对击穿对象发起 State Challenge、登记诊断或查看能力指标时使用。",
    bodyLines: [
      "# pomaster-production —— 生产反馈",
      "",
      "## 何时用",
      "",
      "- SLO 击穿闭环：band 定义 → evaluate 三态 → challenge → diagnose → metrics。",
      "",
      "从已登记 band 与真实 observation 开始；evaluate 只判定观测，challenge/diagnose 记录后续治理事实，不能把告警直接改写成 Truth。按 JSON 状态与 error/hint 处理，缺 observation 时先补观测。",
      "",
      ...commandBlock([
        "pomaster production band/evaluate/challenge/diagnose/metrics/self-improvement",
      ]),
    ],
  },
  {
    name: "pomaster-runtime",
    description:
      "POMaster 多 Agent 与执行身份面——会话/锁/执行身份/追踪。当需要注册会话、获取三粒度互斥锁、登记 AGX 执行身份、查看封存 trace 或观测 agents 运行时状态时使用。",
    bodyLines: [
      "# pomaster-runtime —— 多 Agent / 执行身份",
      "",
      "## 何时用",
      "",
      "- 会话注册/心跳、三粒度互斥锁（acquire 永不自动抢占）、AGX 执行身份、封存 trace、运行时观测。",
      "",
      "## 开工输入",
      "",
      "准备稳定的 `session_key` 与 harness；执行工作需要已登记的 TASK/CHANGE、角色、runtime、identity kind，必要时关联 permit。`execution begin` 返回的 AGX 是 plan run、record 与 audit 的身份来源，禁止自造。",
      "",
      "## 动作选择",
      "",
      "1. `session attach` 注册或恢复上下文；带 reconcile 时 dirty/缺基线仍可附着并显式 warning，且不会扩大 permit。活会话所有权冲突按错误处理。",
      "2. 对并发写范围 `lock acquire`；`LOCK_BLOCKED` 保留持有者信息并等待/协调，acquire 永不自动抢占。只有显式确认接管时才 `lock steal <lock-id> --session-key ... --reason ...`。",
      "3. `execution begin` 登记 AGX 后执行；结束时 `execution end <AGX>`。需要追溯时用 list/audit/trace，审计越界只呈报，不自动修复或扩权。",
      "4. `agents status` 是观测面；当前 `run`/`handoff` 返回 `COMMAND_DEFERRED`，不能当作真实派发成功。由现有 harness 直接执行或形成可恢复交接记录。",
      "",
      "失败恢复以 error/hint 为准：SESSION_NOT_FOUND 先 attach，LOCK_BLOCKED 不重试抢占，身份不存在先 begin。交付 session_key、AGX、持锁/释放状态、审计或 trace 引用；verify 前保持 AGX 可追溯，完成后显式 end/release。",
      "",
      ...commandBlock([
        "pomaster agents status",
        "pomaster session attach --session-key <key> --harness <id> [--task <TASK.*>] [--reconcile <PERMIT.*>]",
        "pomaster session refresh --session-key <key>",
        "pomaster session list",
        "pomaster lock acquire --kind <change|task> --session-key <key> --ref <ref> [--execution-id <AGX-n>]",
        "pomaster lock acquire --kind unit --session-key <key> --object-key <key> [--execution-id <AGX-n>]",
        "pomaster lock heartbeat --lock <lock-id> --session-key <key>",
        "pomaster lock release --lock <lock-id> --session-key <key>",
        "pomaster lock steal <lock-id> --session-key <key> --reason <text> [--execution-id <AGX-n>]",
        "pomaster lock list",
        "pomaster execution begin --role <role> --runtime <runtime> --identity-kind <kind> [--task-id <TASK.*>]",
        "pomaster execution end <AGX-n>",
        "pomaster execution list",
        "pomaster execution audit --execution-id <AGX-n> --diff-base <git-ref>",
        "pomaster trace show <AGX-n> [--seal --retention <EPHEMERAL|TASK_RETENTION|INCIDENT_RETENTION|AUDIT_RETENTION>]",
        "pomaster trace list",
        "pomaster run <task>   # 当前显式 COMMAND_DEFERRED",
        "pomaster handoff <task> --to <role>   # 当前显式 COMMAND_DEFERRED",
      ]),
    ],
  },
];
