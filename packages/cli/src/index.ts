/**
 * @pomaster/cli —— POMaster vNext 命令面（八拍 Change Loop 语义）。
 *
 * 六命令（PRD §44/§45；全部支持 --json 机读信封，禁止彩色自然语言当机读接口）：
 * - init            BOOTSTRAP：创建 .pomaster/ 最小骨架 + AGENTS.md/CLAUDE.md 轻入口（D13）
 * - triage <request> 八拍①：规则桶判档（C1；TTL 168h，C9）
 * - status          读 .pomaster/state：对象计数/分母状态/permit 活性
 * - context compile 八拍③：转调 kernel compileProjection，输出三分区 markdown
 * - doctor          内核探针 + chrome-devtools MCP 探测（D7/D22，四态矩阵 fail-closed）
 * - check --fast    八拍⑤：转调 gauntlet-lite build adapter（NOT_INSTALLED 绝不静默通过）
 *
 * 分层纪律：判卷权威在 @pomaster/kernel，本包只做编排与呈现，禁止旁路写状态。
 * 词表纪律：本包局部词（triage 档位/证据级、doctor 四态）均带 TODO(vocab-pr) 注记。
 */
import { Command } from "commander";
import { CLI_NAME } from "./cli-info.js";
import { toEnvelope, type CliEnvelope, type CommandOutcome } from "./envelope.js";
import { runInit } from "./init.js";
import { triageRequest } from "./triage.js";
import { runStatus } from "./status.js";
import { runContextCompile } from "./context.js";
import { runDoctor } from "./doctor.js";
import { runCheckFast } from "./check.js";

export { CLI_NAME, CLI_VERSION } from "./cli-info.js";
export { toEnvelope } from "./envelope.js";
export type { CliEnvelope, CommandOutcome } from "./envelope.js";
export * from "./store-layout.js";
export * from "./digest.js";
export * from "./triage.js";
export { runInit } from "./init.js";
export { runStatus } from "./status.js";
export { runContextCompile, classifyKernelError } from "./context.js";
export {
  runDoctor,
  probeChromeDevtoolsMcp,
  CHROME_DEVTOOLS_MCP_HINT,
  DOCTOR_PROBE_STATUSES,
} from "./doctor.js";
export { runCheckFast, FAST_CHECK_GATE } from "./check.js";

/** 一次命令执行的人读/机读产出记录（runCli 据此决定退出码与输出）。 */
export interface CommandRun<TResult = unknown> {
  readonly command: string;
  readonly outcome: CommandOutcome<TResult>;
  readonly asJson: boolean;
}

export interface CliIo {
  stdout(line: string): void;
  stderr(line: string): void;
}

const defaultIo: CliIo = {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
};

/** §45 双输出：--json → stdout 机读信封；否则人读纯文本（无颜色码；失败走 stderr）。 */
export function emitCommand(run: CommandRun, io: CliIo = defaultIo): void {
  if (run.asJson) {
    const envelope: CliEnvelope<unknown> = toEnvelope(run.command, run.outcome);
    io.stdout(JSON.stringify(envelope, null, 2));
    return;
  }
  const target = run.outcome.ok ? io.stdout : io.stderr;
  for (const line of run.outcome.human) target(line);
}

/** 解析 --dir（程序级全局选项；沿父链上溯，兼容任意参数位置）。 */
function resolveDir(command: Command): string {
  let cursor: Command | null = command;
  while (cursor !== null) {
    const dir = cursor.opts().dir;
    if (typeof dir === "string" && dir.length > 0) return dir;
    cursor = cursor.parent;
  }
  return process.cwd();
}

/**
 * 组装 commander 程序（六命令；--dir 指定项目根，缺省当前目录）。
 * runs 非空时，每个 action 把执行记录推入其中（供 runCli 汇总退出码与测试断言）。
 */
export function createProgram(
  runs?: CommandRun[],
  io: CliIo = defaultIo,
): Command {
  const record =
    runs === undefined
      ? (run: CommandRun) => emitCommand(run, io)
      : (run: CommandRun) => {
          runs.push(run);
          emitCommand(run, io);
        };

  const program = new Command();
  // exitOverride：commander 的用法错误/帮助路径一律改为 throw（CommanderError），
  // 由 runCli 统一捕获——退出码语义收敛到 runCli 返回值，且 stderr 提示保留 commander 原文。
  program.exitOverride();
  program
    .name(CLI_NAME)
    .description(
      "POMaster vNext — Governed Software State Control Plane（八拍 Change Loop 命令面）",
    )
    .version("0.0.0")
    .option("--dir <path>", "project root directory", process.cwd());

  program
    .command("init")
    .description(
      "创建 .pomaster/ 最小骨架 + AGENTS.md/CLAUDE.md 轻入口（幂等；重复执行 NO_CHANGE）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runInit(resolveDir(command));
      record({ command: "init", outcome, asJson: command.opts().json === true });
    });

  program
    .command("triage")
    .description(
      "八拍①：规则桶判档（跨域 contract→STANDARD；纯文案/样式→MINIMAL；默认 LIGHT）",
    )
    .argument("<request>", "change request text")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (request: string, _opts, command) => {
      const result = triageRequest(request);
      const human = [
        `triage → ${result.profile} (rule ${result.matched_rule}, grade=${result.evidence_grade}, ttl=${result.ttl_hours}h)`,
        `  absent signals: ${result.absent_signals.join(", ")}`,
      ];
      record({
        command: "triage",
        outcome: { ok: true, result, warnings: [], errors: [], human },
        asJson: command.opts().json === true,
      });
    });

  program
    .command("status")
    .description("输出对象计数/分母状态/permit 活性（读 .pomaster/state）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runStatus(resolveDir(command));
      record({
        command: "status",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  const context = program
    .command("context")
    .description("上下文投影（八拍③ PROJECTION）");
  context
    .command("compile")
    .description(
      "转调 kernel compileProjection，输出三分区 markdown（MUST/ADVISORY/LAZY TOOLS）",
    )
    .requiredOption(
      "--role <role>",
      "role lane (frontend/backend/architect/designer/documenter ...)",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runContextCompile(resolveDir(command), opts.role);
      record({
        command: "context compile",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  program
    .command("doctor")
    .description(
      "内核探针 + chrome-devtools MCP 探测（四态矩阵；缺什么提示装什么，D7/D22）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runDoctor(resolveDir(command));
      record({
        command: "doctor",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  program
    .command("check")
    .description("八拍⑤ VERIFY：FAST gate（BUILD 腿，转调 gauntlet-lite build adapter）")
    .requiredOption("--fast", "run the FAST gate loop (BUILD leg)")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (_opts, command) => {
      const outcome = await runCheckFast(resolveDir(command));
      record({
        command: "check",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  return program;
}

/**
 * 运行 CLI（可测试入口；bin.ts 调用）。返回进程退出码：全部命令 ok=0，否则 1。
 * 意外异常 → 结构化 UNEXPECTED_ERROR 信封（绝不裸栈逃逸到机读接口）。
 * 注：action 内不调用 process.exit——退出码由本函数返回值统一决定。
 */
export async function runCli(
  argv: readonly string[],
  io: CliIo = defaultIo,
): Promise<number> {
  const runs: CommandRun[] = [];
  const program = createProgram(runs, io);
  try {
    await program.parseAsync([...argv], { from: "user" });
    return runs.length > 0 && runs.every((r) => r.outcome.ok) ? 0 : 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const envelope: CliEnvelope<null> = {
      command: "(unhandled)",
      ok: false,
      result: null,
      warnings: [],
      errors: [
        {
          code: "UNEXPECTED_ERROR",
          message,
          hint: "若为 commander 用法错误请查看 --help；否则携带本信封报告缺陷。",
        },
      ],
    };
    if (argv.includes("--json")) {
      io.stdout(JSON.stringify(envelope, null, 2));
    } else {
      io.stderr(`pomaster: ${message}`);
    }
    return 1;
  }
}
