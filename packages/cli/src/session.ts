/**
 * session.ts —— `pomaster session`（无子命令裸形态）：治理速览投影（重入口
 * SessionStart 注入源）。
 *
 * 注意与 D 线会话命令面（session attach/refresh/list，runtime.ts）的关系：同名命令组
 * 的裸形态——commander 混合模式（research list/inspect 先例）：带子命令词形时分发到
 * 子命令，裸形态/仅旗标时运行本投影。本文件只做投影，会话注册语义零涉及。
 *
 * hook 输出契约（与 alerts.ts 同源，research/claude-hooks-reference.md）：
 * - 恒 exit 0：SessionStart exit 2 也只对用户可见、不阻断——但非零 + stdout 仍是错误
 *   通知；本命令恒 ok=true，降级走 warnings 留痕于 --json 信封；
 * - 纯文本不以 `{` 开头：stdout 首字符恒为 `P`（POMaster 词形头），不会被误判 JSON；
 * - ≤10,000 字符硬上限：SessionStart 注入输出超限会被转存文件+预览——本命令自行
 *   截断并加显式标记（capPlainOutput 共享实现，与 alerts 同一口径）；
 * - 亚秒级：只读 truth-index（计数）+ alerts 派生（台账），零现场扫描零写入；
 * - 投影纪律（§1.6）：本命令是 Canonical State 的投影，不是第二事实源——一切计数
 *   与可行动项都派生自 .pomaster/state 现有只读面，正文指针只指向命令卡与 --help。
 */

import { readFile } from "node:fs/promises";
import { capPlainOutput, deriveAlerts, ALERTS_OUTPUT_HARD_CAP } from "./alerts.js";
import { TRUTH_INDEX_RELATIVE, toPosix, truthIndexPath } from "./store-layout.js";
import type { CliWarning, CommandOutcome } from "./envelope.js";
import { okOutcome } from "./envelope.js";

/** SessionStart 注入输出硬上限（官方 hook 上限逐字对齐；共享 capPlainOutput 截断）。 */
export const SESSION_OUTPUT_HARD_CAP = ALERTS_OUTPUT_HARD_CAP;

export interface SessionOverviewResult {
  readonly state_path: string;
  readonly initialized: boolean;
  readonly generation_seq: number;
  readonly objects_total: number;
  readonly denominators_total: number;
  readonly producers_total: number;
  readonly permits_active: number;
  readonly alerts_count: number;
  /** 实际人读输出字符数（≤ SESSION_OUTPUT_HARD_CAP；截断后含标记长度）。 */
  readonly output_characters: number;
  readonly truncated: boolean;
}

/**
 * 计数投影装载（读路径从宽：解析失败的维度按 0 计 + INVALID_STATE 告警——
 * status/inspect 是逐字段判卷面，本投影只服务速览，坏账本已有专门命令显式报错；
 * hook 契约要求恒 exit 0，故降级不失败）。
 */
async function readCounts(
  rootDir: string,
  warnings: CliWarning[],
): Promise<{ initialized: boolean; seq: number; objects: number; denominators: number; producers: number }> {
  let raw: string;
  try {
    raw = await readFile(truthIndexPath(rootDir), "utf8");
  } catch {
    return { initialized: false, seq: 0, objects: 0, denominators: 0, producers: 0 };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("not an object");
    }
    const index = parsed as Record<string, unknown>;
    const generation = index.generation;
    const generationRecord =
      generation !== null && typeof generation === "object"
        ? (generation as Record<string, unknown>)
        : undefined;
    const seq =
      typeof generationRecord?.seq === "number" ? generationRecord.seq : 0;
    const countOf = (key: string): number => {
      const value = index[key];
      if (!Array.isArray(value)) {
        warnings.push({
          code: "INVALID_STATE",
          message: `truth-index.${key} is not an array; counted as 0`,
          hint: `修复 ${toPosix(TRUTH_INDEX_RELATIVE)}（机器事务维护）；速览投影按缺席计 0 不失败。`,
        });
        return 0;
      }
      return value.length;
    };
    return {
      initialized: true,
      seq,
      objects: countOf("objects"),
      denominators: countOf("denominators"),
      producers: countOf("producers"),
    };
  } catch (err) {
    warnings.push({
      code: "INVALID_STATE",
      message: `truth-index is not valid JSON object: ${(err as Error).message}`,
      hint: `修复 ${toPosix(TRUTH_INDEX_RELATIVE)}；速览投影降级为未初始化形态不失败。`,
    });
    return { initialized: false, seq: 0, objects: 0, denominators: 0, producers: 0 };
  }
}

/**
 * `pomaster session`（裸形态）：治理速览投影。恒 ok=true；输出 ≤10k 硬上限；
 * 未初始化 = 一行缺席说明 + init 路标（SessionStart 每次会话注入，缺席说明是
 * 一次性引导而非噪声——与 alerts 的「未初始化=静默」相区分：速览被显式请求，
 * 告警通道必须自我克制）。
 */
export async function runSessionOverview(rootDir: string): Promise<CommandOutcome<SessionOverviewResult>> {
  const warnings: CliWarning[] = [];
  const counts = await readCounts(rootDir, warnings);
  const derivation = counts.initialized ? await deriveAlerts(rootDir) : null;
  if (derivation !== null) warnings.push(...derivation.warnings);

  let lines: readonly string[];
  if (!counts.initialized) {
    lines = [
      "POMaster 治理速览：未初始化（.pomaster/state/truth-index.json 缺席）。",
      "- 运行 pomaster init 建立治理基线；pomaster --help 查看命令全景。",
    ];
  } else {
    const alertsCount = derivation?.alerts.length ?? 0;
    const permitsActive = derivation?.permits_active ?? 0;
    lines = [
      "POMaster 治理速览（SessionStart 投影；完整命令卡见 pomaster skill——单一事实源 pomaster --help）",
      `- objects: ${counts.objects}（denominators: ${counts.denominators} / producers: ${counts.producers}）`,
      `- generation.seq: ${counts.seq}`,
      `- permits active: ${permitsActive}`,
      alertsCount > 0
        ? `- alerts: ${alertsCount} 项可行动（pomaster alerts 查看明细）`
        : "- alerts: 干净（无可行动项）",
      "- Browser Eyes: 诊断「慢/报错/卡住」用 chrome-devtools MCP 实测（禁只看代码推断）；E2E/交互验证用 playwright MCP（pomaster doctor --json 自检）",
    ];
  }

  const capped = capPlainOutput(lines, SESSION_OUTPUT_HARD_CAP);
  const result: SessionOverviewResult = {
    state_path: toPosix(TRUTH_INDEX_RELATIVE),
    initialized: counts.initialized,
    generation_seq: counts.seq,
    objects_total: counts.objects,
    denominators_total: counts.denominators,
    producers_total: counts.producers,
    permits_active: derivation?.permits_active ?? 0,
    alerts_count: derivation?.alerts.length ?? 0,
    output_characters: capped.text.length,
    truncated: capped.truncated,
  };
  return okOutcome("session", result, capped.text.split("\n"), warnings);
}
