/**
 * heavy-entry.ts —— 重入口交付面（D13 2026-09-03 修订：重入口默认 + `--mode light` 显式退回）。
 *
 * 修订前的 D13 =「静态轻入口、无 hook 注入」；Owner 裁决（2026-09-03，任务
 * 09-03-vnext-heavy-entry）将其翻转为「重入口默认」：init 无旗标/交互确认/--json 均
 * 生成 skills 库 + hook 注入 + 加厚平台 rules；`--mode light` 是显式退回形态（可逆：
 * 对已重入口项目执行时按平台清单移除本包安装物并重写入口文件回轻形态）。
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

// ============================================================
// 模式词表与入口模式标记
// ============================================================

/** init 入口模式词表闭包（--mode 词形；词表外 → SCHEMA_INVALID fail-closed）。 */
export const INIT_MODES = ["heavy", "light"] as const;

export type InitMode = (typeof INIT_MODES)[number];

/**
 * 入口模式机读标记（AGENTS.md 首两行之一；doctor 探针据此判定「应装未装」而
 * 不误伤 --mode light 显式退回形态——标记缺席视同 light，不猜测）。
 */
export const ENTRY_MODE_HEAVY_MARKER = "<!-- pomaster:entry-mode:heavy -->";
export const ENTRY_MODE_LIGHT_MARKER = "<!-- pomaster:entry-mode:light -->";

/** claude 平台 hook 注册文件（项目级，可提交仓库——团队共享重入口是合法形态）。 */
export const CLAUDE_SETTINGS_RELATIVE = ".claude/settings.json";

// ============================================================
// hooks 注册（claude 层）：shell form 无 args + 恒 exit 0 输出契约
// ============================================================

/**
 * 本包 hook 注册清单（事件 → shell form 命令；无 args——Windows 走 Git Bash/
 * PowerShell 解析 npm shim；SessionStart matcher 省略 = startup/resume/clear/
 * compact/fork 全形态；UserPromptSubmit 无 matcher 支持、每轮必触发）。
 * 禁用 `if` 字段：非 tool-event hook 上设 if = 永不运行（官方 Hooks Reference）。
 */
export const POMASTER_HOOK_EVENT_COMMANDS: readonly {
  readonly event: string;
  readonly command: string;
}[] = [
  { event: "SessionStart", command: "pomaster session" },
  { event: "UserPromptSubmit", command: "pomaster alerts" },
];

/** 本包 hook 命令词形闭包（幂等查重与卸载剥离的唯一识别依据）。 */
export const POMASTER_HOOK_COMMANDS: readonly string[] =
  POMASTER_HOOK_EVENT_COMMANDS.map((entry) => entry.command);

/** hook handler 词形（settings.json 落盘形态；type: command + shell form command）。 */
export interface HookHandlerSpec {
  readonly type: "command";
  readonly command: string;
}

/** matcher-group 词形（本包只产出无 matcher 的 group；既有 group 原样保留）。 */
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
export function mergePomasterHooks(existingText: string | null): HooksMergeOutcome {
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
  for (const { event, command } of POMASTER_HOOK_EVENT_COMMANDS) {
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
    const alreadyRegistered = groups.some((group) =>
      (((group as Record<string, unknown>).hooks ?? []) as unknown[]).some(
        (handler) =>
          handler !== null &&
          typeof handler === "object" &&
          (handler as Record<string, unknown>).command === command,
      ),
    );
    if (!alreadyRegistered) {
      groups.push({ hooks: [{ type: "command", command }] satisfies HookMatcherGroup });
      hooks[event] = groups;
      changed = true;
    }
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

/** 剥离结果词形：changed=true 时 nextText 为剥除后的写盘文本；error = fail-closed 不动文件。 */
export type HooksStripOutcome =
  | { readonly changed: true; readonly nextText: string }
  | { readonly changed: false }
  | { readonly error: string };

/**
 * 读-剥离-写回（纯函数；--mode light 重→轻可逆的 hooks 半边）：按 command 词形
 * 移除本包 handler——组内剥除后为空则丢组、事件数组为空则丢事件键、hooks 对象
 * 为空则丢 hooks 键（恢复安装前形态）；其余内容逐字节保留。
 */
export function stripPomasterHooks(existingText: string): HooksStripOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(existingText);
  } catch (err) {
    return { error: `不是合法 JSON：${(err as Error).message}` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "顶层不是 JSON 对象" };
  }
  const record = parsed as Record<string, unknown>;
  const rawHooks = record.hooks;
  if (rawHooks === undefined) return { changed: false };
  if (rawHooks === null || typeof rawHooks !== "object" || Array.isArray(rawHooks)) {
    return { error: "hooks 键不是对象" };
  }
  let changed = false;
  const nextHooks: Record<string, unknown> = {};
  for (const [event, raw] of Object.entries(rawHooks as Record<string, unknown>)) {
    const ownCommands = POMASTER_HOOK_EVENT_COMMANDS
      .filter((entry) => entry.event === event)
      .map((entry) => entry.command);
    if (!Array.isArray(raw) || ownCommands.length === 0) {
      nextHooks[event] = raw;
      continue;
    }
    const nextGroups: unknown[] = [];
    for (const group of raw as unknown[]) {
      if (group === null || typeof group !== "object" || Array.isArray(group)) {
        nextGroups.push(group);
        continue;
      }
      const handlers = (group as Record<string, unknown>).hooks;
      if (!Array.isArray(handlers)) {
        nextGroups.push(group);
        continue;
      }
      const kept = (handlers as unknown[]).filter(
        (handler) =>
          !(
            handler !== null &&
            typeof handler === "object" &&
            ownCommands.includes((handler as Record<string, unknown>).command as string)
          ),
      );
      if (kept.length !== (handlers as unknown[]).length) changed = true;
      if (kept.length > 0) {
        nextGroups.push({ ...(group as Record<string, unknown>), hooks: kept });
      }
    }
    if (nextGroups.length > 0) nextHooks[event] = nextGroups;
  }
  if (!changed) return { changed: false };
  if (Object.keys(nextHooks).length > 0) record.hooks = nextHooks;
  else delete record.hooks;
  return { changed: true, nextText: `${JSON.stringify(record, null, 2)}\n` };
}

// ============================================================
// Skill 库（15 份 × 2 镜像；frontmatter 标准公共分母 name+description）
// ============================================================

/** 单份 skill 清单条目：name=目录名（agentskills.io spec 强制一致）；description 承载触发语义。 */
export interface SkillSpec {
  readonly name: string;
  readonly description: string;
  /** 正文（命令卡：何时用 + 命令词形；Browser Eyes 与单一事实源段由 renderSkillMd 统一追加）。 */
  readonly bodyLines: readonly string[];
}

/** 双镜像目录（POSIX 相对路径）。.agents = 通用层（9+ agent 原生读取）；.claude = Claude Code 必需位。 */
export const SKILL_MIRROR_DIRS = [".agents/skills", ".claude/skills"] as const;

/** 命令全景行集（router skill 与 cursor/qoder 加厚 rules 共用；与 pomaster --help 对账钉版）。 */
export const COMMAND_PANORAMA_LINES: readonly string[] = [
  "# 0 BOOTSTRAP —— 建基线 / 速览 / 可行动项 / 装眼睛 / 可移植性 / 自更新",
  "pomaster init",
  "pomaster status",
  "pomaster session        # 治理速览（无子命令形态；SessionStart 注入源，≤10k 字符）",
  "pomaster alerts         # 可行动项过滤器（干净=空输出；UserPromptSubmit 轻提醒源）",
  "pomaster doctor",
  "pomaster portability bootstrap/check",
  "pomaster update --check/--yes",
  "",
  "# ① TRIAGE —— 秒级判档（MINIMAL/LIGHT/STANDARD；NO-OP 合法）",
  'pomaster triage "<request>"',
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
  "# ⑤ VERIFY —— FAST gate / gate recipes 派发 / 证据入账",
  "pomaster check --fast/--gates",
  "pomaster record gate-run/claim",
  "",
  "# ⑥ RECONCILE —— delta 三方对账 / 投影视图 / 审计 / 例外台账",
  "pomaster reconcile --permit <PERMIT.*>",
  "pomaster view blueprint/task",
  "pomaster audit blueprint/task",
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
  "pomaster brainstorm start/status/promote",
  "pomaster research list/inspect",
  "pomaster eval --suite behavioral",
  "pomaster catalog status/explain/relock",
  "pomaster migrate trellis-spec --analyze --spec-root <dir>",
  "pomaster production band/evaluate/challenge/diagnose/metrics/self-improvement",
  "pomaster agents status",
  "pomaster run <task>",
  "pomaster handoff <task> --to <role>",
  "pomaster session attach/refresh/list",
  "pomaster lock acquire/heartbeat/release/steal/list",
  "pomaster execution begin/end/list",
  "pomaster trace show/list",
];

/** Browser Eyes 统一引用段（每份命令卡尾部；与 AGENTS.md 同源口径）。 */
const SKILL_BROWSER_EYES_LINES: readonly string[] = [
  "## Browser Eyes（浏览器双眼）",
  "",
  "- chrome-devtools MCP = 观测眼：诊断「慢/报错/卡住」必须实测（performance trace / network / console），禁只看代码推断。",
  "- playwright MCP = 验证眼：E2E smoke / 交互验证用 playwright 确定性驱动。",
  "- 可用性自检：`pomaster doctor --json` 的 chrome_devtools_mcp / playwright_mcp 探针行。",
];

/** 单一事实源对账段（每份命令卡尾部；防文档漂移的钉版测试锚 + 双镜像重复发现缓解）。 */
const SKILL_SOURCE_LINES: readonly string[] = [
  "## 单一事实源",
  "",
  "本卡片与 `pomaster --help` 对账（init 钉版测试防漂移）；机读输出一律走 `--json` 信封（§45）。",
  "本文件由 `pomaster init` 生成（重入口 skills 库；`--mode light` 移除）。",
  "",
  "<!-- pomaster:generated -->",
];

/** 卡片装配：frontmatter（name=目录名 + 双引号 description）+ 空行 + 正文 + 统一段。双镜像共用同一字符串。 */
export function renderSkillMd(spec: SkillSpec): string {
  return [
    "---",
    `name: ${spec.name}`,
    `description: "${spec.description}"`,
    "---",
    "",
    ...spec.bodyLines,
    "",
    ...SKILL_BROWSER_EYES_LINES,
    "",
    ...SKILL_SOURCE_LINES,
    "",
  ].join("\n");
}

/** 八拍分段卡公共命令段包装。 */
function commandBlock(lines: readonly string[]): string[] {
  return ["## 命令", "", "```text", ...lines, "```", ""];
}

/**
 * Skill 库清单（15 条目；prd.md「Skill 库」表逐行对应：router + 八拍九段 +
 * 横切五面）。description 写用户会自然说出的触发词（harness 自动选路由面），
 * 首句自含完整触发语义（防 listing 截断后失效）。
 */
export const SKILL_MANIFEST: readonly SkillSpec[] = [
  {
    name: "pomaster",
    description:
      "POMaster vNext 命令全景与八拍 Change Loop 路由。一切 pomaster CLI 使用入口——定位八拍阶段（判档/许可/投影/执行/验证/对账/折叠/收口）后进入对应 pomaster-* 分段 skill；含治理状态速览与 Browser Eyes 双眼引导。",
    bodyLines: [
      "# pomaster —— 命令全景路由",
      "",
      "一切 pomaster 使用的入口：先在本卡片定位八拍阶段，再进入对应分段 skill（pomaster-bootstrap / pomaster-triage / pomaster-permit / pomaster-context / pomaster-execute / pomaster-verify / pomaster-reconcile / pomaster-compact / pomaster-closeout / pomaster-inspect / pomaster-discovery / pomaster-catalog / pomaster-production / pomaster-runtime）。",
      "",
      "## 命令全景",
      "",
      "```text",
      ...COMMAND_PANORAMA_LINES,
      "```",
      "",
      "## 何时用哪个",
      "",
      "- 0 BOOTSTRAP → pomaster-bootstrap；① 判档 → pomaster-triage；② 许可 → pomaster-permit；③ 投影 → pomaster-context；④ 执行 → pomaster-execute；⑤ 验证 → pomaster-verify；⑥ 对账 → pomaster-reconcile；⑦ 折叠 → pomaster-compact；⑧ 收口 → pomaster-closeout。",
      "- 横切：检视/图/语义解析 → pomaster-inspect；发现面 → pomaster-discovery；策展物料 → pomaster-catalog；生产反馈 → pomaster-production；多 Agent/执行身份 → pomaster-runtime。",
      "- 会话开场速览：`pomaster session`（无子命令形态，SessionStart 注入源）；每轮可行动项：`pomaster alerts`（UserPromptSubmit 轻提醒源，干净=空输出）。",
      "",
    ],
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
      ...commandBlock(COMMAND_PANORAMA_LINES.slice(1, 8)),
    ],
  },
  {
    name: "pomaster-triage",
    description:
      "POMaster 八拍① TRIAGE——秒级判档。当需要为新变更判定治理档位（MINIMAL/LIGHT/STANDARD）、解释判档依据（matched_rule + absent_signals）或确定后续 gate 强度时使用。",
    bodyLines: [
      "# pomaster-triage —— 八拍① TRIAGE",
      "",
      "## 何时用",
      "",
      "- 开始一次变更前判定治理档位；NO-OP 是合法成功。",
      "- 需要解释「为什么判成这一档」（判定必附缺席信号清单，不冒充实测）。",
      "",
      ...commandBlock(['pomaster triage "<request>"']),
    ],
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
      ...commandBlock(["pomaster permit issue/check/steal/list"]),
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
      "- 为角色 lane 取最小充分上下文（MUST/ADVISORY/KNOWLEDGE/CATALOG/LAZY TOOLS 五分区）。",
      "- 需要解释 catalog 物料为何被纳入/排除时（决策面与 Agent Context 严格隔离）。",
      "",
      ...commandBlock(["pomaster context compile/explain"]),
    ],
  },
  {
    name: "pomaster-execute",
    description:
      "POMaster 八拍④ EXECUTE——受控写路径。当需要机器判卷一次写尝试（exec-guard）或以显式事务落库受控变更（maintain）时使用；写路径判卷权威在 kernel，CLI 只编排呈现。",
    bodyLines: [
      "# pomaster-execute —— 八拍④ EXECUTE",
      "",
      "## 何时用",
      "",
      "- 写路径执行点判卷（严格判卷器非写入器；非 allow 一律拒绝）。",
      "- 受控变更经显式事务落库（kernel applyTransaction 唯一写入路径）。",
      "",
      ...commandBlock([
        "pomaster exec-guard --attempt <file|->",
        "pomaster maintain <change-or-task> --ops <tx>",
      ]),
    ],
  },
  {
    name: "pomaster-verify",
    description:
      "POMaster 八拍⑤ VERIFY——确定性 gate 判卷与证据入账。当需要跑 FAST gate、派发 catalog gate recipes、把 gate 运行结果或 claim 以 GRN/CLM 收据入账时使用；工具缺席=显式 NOT_RUN 非绿非红。",
    bodyLines: [
      "# pomaster-verify —— 八拍⑤ VERIFY",
      "",
      "## 何时用",
      "",
      "- 内循环自检（FAST gate，BUILD 腿，纯读）或全 gate recipes 派发。",
      "- 把 gate 运行结果 / claim 显式落账 evidence 平面（GRN/CLM 收据）。",
      "",
      ...commandBlock(["pomaster check --fast/--gates", "pomaster record gate-run/claim"]),
    ],
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
      ...commandBlock([
        "pomaster reconcile --permit <PERMIT.*>",
        "pomaster view blueprint/task",
        "pomaster audit blueprint/task",
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
      ...commandBlock(["pomaster closeout <task-id>"]),
    ],
  },
  {
    name: "pomaster-inspect",
    description:
      "POMaster 横切检视面——对象检视/图视图/语义解析。当需要检视单个对象的正文与证据谱系、查看对象依赖图与影响闭包、或把需求词形解析到既有对象与 archetype 标准件时使用。",
    bodyLines: [
      "# pomaster-inspect —— 横切检视",
      "",
      "## 何时用",
      "",
      "- 检视单对象（正文+证据+谱系，纯读零写入）。",
      "- 对象图/影响闭包；需求词形先解析再决定是否新建（NO_MATCH 显式不臆造）。",
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
      "POMaster 发现面——brainstorm 讨论区/研究产物/行为评测。当需要开启或推进 Discovery scratchpad、检视 research artifact 或跑 Agent 行为评测 suite 时使用。",
    bodyLines: [
      "# pomaster-discovery —— 发现面",
      "",
      "## 何时用",
      "",
      "- 未达晋升条件的讨论驻留 scratchpad（Ephemeral 纪律）；达标后显式 promote。",
      "- research 产物判读（五级 Evidence）；行为评测（fail-closed）。",
      "",
      ...commandBlock([
        "pomaster brainstorm start/status/promote",
        "pomaster research list/inspect",
        "pomaster eval --suite behavioral",
      ]),
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
      ...commandBlock([
        "pomaster agents status",
        "pomaster session attach/refresh/list",
        "pomaster lock acquire/heartbeat/release/steal/list",
        "pomaster execution begin/end/list",
        "pomaster trace show/list",
        "pomaster run <task>",
        "pomaster handoff <task> --to <role>",
      ]),
    ],
  },
];
