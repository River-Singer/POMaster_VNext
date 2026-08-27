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
 * - AGENTS.md/CLAUDE.md 仅当缺失或带本包生成标记时重写（D13 轻入口）。
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import {
  AGENTS_MD_RELATIVE,
  CLAUDE_MD_RELATIVE,
  CONFIG_RELATIVE,
  GENERATED_MARKER,
  TRUTH_INDEX_RELATIVE,
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

export interface InitResult {
  readonly change: InitChange;
  readonly tool: typeof INIT_TOOL_ID;
  readonly profile: TriageProfile;
  readonly files: readonly InitFileReport[];
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

## 机器可读输出

一切命令支持 \`--json\`（§45）；禁止解析彩色自然语言判断状态——机读唯一接口是 JSON 信封。
`;
}

const CLAUDE_ENTRY_CONTENT = `# POMaster vNext — Claude 轻入口

Claude harness 入口与 AGENTS.md 共享同一轻入口（D13）：

@AGENTS.md
`;

interface FileWritePlan {
  readonly relative: string;
  readonly absolute: string;
  readonly content: string;
  /** true = 仅当缺失或带生成标记时写入；false = 只在缺失时创建。 */
  readonly mayUpdate: boolean;
}

/**
 * 执行 init。幂等：重复执行至第二次起 NO_CHANGE（字节稳定，零写入）。
 */
export async function runInit(rootDir: string): Promise<CommandOutcome<InitResult>> {
  const warnings: CliWarning[] = [];
  const errors: CliError[] = [];
  const files: InitFileReport[] = [];

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

  // 3) config.yaml：只在缺失时创建（人类可编辑，永不覆盖）。
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

  // 4) 轻入口（D13）：AGENTS.md 渲染 profile + truth-index 速览；CLAUDE.md 导入 AGENTS.md。
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
    {
      relative: CLAUDE_MD_RELATIVE,
      absolute: `${rootDir}/${CLAUDE_MD_RELATIVE}`,
      content: withMarker(CLAUDE_ENTRY_CONTENT),
      mayUpdate: true,
    },
  ];
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

  const created = files.some((f) => f.action === "created");
  const updated = files.some((f) => f.action === "updated");
  const change: InitChange = created ? "CREATED" : updated ? "UPDATED" : "NO_CHANGE";
  const result: InitResult = { change, tool: INIT_TOOL_ID, profile, files };

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

  const human = [
    `init: ${change}`,
    ...files.map((f) => `  ${f.action.padEnd(15)} ${f.file}`),
    `  profile: ${profile}`,
  ];
  return okOutcome("init", result, human, warnings);
}
