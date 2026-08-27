/**
 * envelope.ts —— §45 CLI 输出契约的机读信封。
 *
 * 契约锚点（PRD §45）：所有核心命令必须支持 human-readable stdout + --json machine output；
 * 禁止让上层 Agent 通过解析彩色控制台自然语言判断状态——因此：
 * - 本包不使用任何 ANSI 颜色码；人读输出是纯文本辅助，机读唯一接口是 --json 信封；
 * - 失败/缺席必须显式表达（errors[].code + hint），禁止静默跳过当通过（C1 镜像纪律）；
 * - 报错必须带路标（escalation 纪律）：errors[].hint 说清去哪修。
 */

/** 结构化告警（不改变 ok 语义，但必须可见；hint 给修复路标——报错带路标纪律同样适用）。 */
export interface CliWarning {
  readonly code: string;
  readonly message: string;
  readonly hint?: string;
}

/** 结构化错误（ok=false；code 稳定可断言，hint 给修复路标）。 */
export interface CliError {
  readonly code: string;
  readonly message: string;
  readonly hint: string;
}

/** §45 机读信封：一切命令 --json 模式的顶层形态。 */
export interface CliEnvelope<TResult = unknown> {
  readonly command: string;
  readonly ok: boolean;
  readonly result: TResult;
  readonly warnings: readonly CliWarning[];
  readonly errors: readonly CliError[];
}

/** 命令实现的标准返回：机读信封原料 + 人读纯文本行。 */
export interface CommandOutcome<TResult = unknown> {
  readonly ok: boolean;
  readonly result: TResult;
  readonly warnings: readonly CliWarning[];
  readonly errors: readonly CliError[];
  /** 人读输出（纯文本，无颜色码；--json 模式下不输出）。 */
  readonly human: readonly string[];
}

export function okOutcome<TResult>(
  command: string,
  result: TResult,
  human: readonly string[],
  warnings: readonly CliWarning[] = [],
): CommandOutcome<TResult> {
  return { ok: true, result, warnings, errors: [], human };
}

export function failOutcome<TResult>(
  command: string,
  result: TResult,
  errors: readonly CliError[],
  human: readonly string[],
  warnings: readonly CliWarning[] = [],
): CommandOutcome<TResult> {
  return { ok: false, result, warnings, errors, human };
}

/** CommandOutcome → §45 机读信封（字段顺序稳定，快照测试友好）。 */
export function toEnvelope<TResult>(
  command: string,
  outcome: CommandOutcome<TResult>,
): CliEnvelope<TResult> {
  return {
    command,
    ok: outcome.ok,
    result: outcome.result,
    warnings: outcome.warnings,
    errors: outcome.errors,
  };
}
