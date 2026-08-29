/**
 * @pomaster/cli —— POMaster vNext 命令面（八拍 Change Loop 语义）。
 *
 * 命令面（PRD §44/§45；全部支持 --json 机读信封，禁止彩色自然语言当机读接口）：
 * - init            BOOTSTRAP：创建 .pomaster/ 最小骨架 + AGENTS.md/CLAUDE.md 轻入口（D13）
 * - triage <request> 八拍①：规则桶判档（C1；TTL 168h，C9）
 * - permit issue/check/steal/list
 *                   八拍②：FRAMEWORK LOCK 命令面（签发/判卷/显式接管/台账呈现；G1）
 * - exec-guard      八拍④：写路径机器执行点（判卷器非写入器；G2）
 * - reconcile       八拍⑥：按 permit 基线出 delta 三段报告（changed/exceptions/samples；G3）
 * - compact         八拍⑦：episode 折叠为单次 applyTransaction（证据批量收编 + 显式 ops；
 *                   NO_CHANGE 是合法出口；G4）
 * - record          证据入账通路：gate-run/claim 显式单条落账 evidence 平面（G6）
 * - status          读 .pomaster/state：对象计数/分母状态/permit 活性
 * - inspect         单对象检视：正文+证据+谱系纯读呈现（零写入；PRD §44.1 基础命令）
 * - maintain        受控变更（--ops 显式事务，判卷权威在 kernel applyTransaction）/
 *                   pre-dev 链（--phase pre-dev：triage→permit issue→context compile；PRD §44.4）
 * - context compile 八拍③：转调 kernel compileProjection，输出三分区 markdown
 * - doctor          内核探针 + chrome-devtools MCP 探测（D7/D22，四态矩阵 fail-closed）
 * - check --fast    八拍⑤：转调 gauntlet-lite build adapter（NOT_INSTALLED 绝不静默通过）
 *
 * 分层纪律：判卷权威在 @pomaster/kernel，本包只做编排与呈现，禁止旁路写状态
 * （例外：check/exec-guard 对过期许可追加 PERMIT_EXPIRED_OBSERVED 为 kernel 契约行为）。
 * 词表纪律：本包局部词（triage 档位/证据级、doctor 四态、permit list status 三值、
 * maintain --phase 相值）均带 TODO(vocab-pr) 注记。
 */
import { Command, CommanderError } from "commander";
import { CLI_NAME } from "./cli-info.js";
import { toEnvelope, type CliEnvelope, type CommandOutcome } from "./envelope.js";
import { runInit } from "./init.js";
import { triageRequest } from "./triage.js";
import { runStatus } from "./status.js";
import { runInspect } from "./inspect.js";
import { runMaintain } from "./maintain.js";
import { runContextCompile } from "./context.js";
import { runDoctor } from "./doctor.js";
import { runCheckFast } from "./check.js";
import { runPermitCheck, runPermitIssue, runPermitList, runPermitSteal } from "./permit.js";
import { runExecGuard } from "./exec-guard.js";
import { runReconcile } from "./reconcile.js";
import { runCompact } from "./compact.js";
import { runRecordClaim, runRecordGateRun } from "./record.js";

export { CLI_NAME, CLI_VERSION } from "./cli-info.js";
export { toEnvelope } from "./envelope.js";
export type { CliEnvelope, CommandOutcome } from "./envelope.js";
export * from "./store-layout.js";
export * from "./digest.js";
export * from "./triage.js";
export { runInit } from "./init.js";
export { runStatus } from "./status.js";
export { runInspect } from "./inspect.js";
export type {
  InspectInput,
  InspectResult,
  InspectLineage,
  InspectRunEntry,
  InspectClaimEntry,
} from "./inspect.js";
export { runMaintain, MAINTAIN_PHASES } from "./maintain.js";
export type {
  MaintainInput,
  MaintainResult,
  MaintainApplyResult,
  MaintainPreDevResult,
  MaintainPhase,
  MaintainTriageView,
  MaintainPermitView,
  MaintainProjectionView,
} from "./maintain.js";
export { runContextCompile, classifyKernelError } from "./context.js";
export {
  runDoctor,
  probeChromeDevtoolsMcp,
  CHROME_DEVTOOLS_MCP_HINT,
  DOCTOR_PROBE_STATUSES,
} from "./doctor.js";
export { runCheckFast, FAST_CHECK_GATE } from "./check.js";
export {
  runPermitIssue,
  runPermitCheck,
  runPermitSteal,
  runPermitList,
  PERMIT_WRITE_OPS,
  PERMIT_LIST_STATES,
  deniedReasonToCode,
  parseActorArgv,
  parseIdArgv,
  parseAcceptanceShapeArgv,
  parseTtlBeatsArgv,
  governanceErrorToCliError,
  BASELINE_NOTE,
  EXPIRED_OBSERVED_NOTE,
} from "./permit.js";
export type {
  PermitIssueResult,
  PermitCheckResultView,
  PermitStealResult,
  PermitListResult,
  PermitListEntry,
  PermitListEvent,
  PermitListStatus,
  PermitActorView,
  PermitScopeView,
  PermitIssueInput,
  PermitCheckInput,
  PermitStealInput,
  PermitListInput,
  PermitWriteOp,
} from "./permit.js";
export { runExecGuard, KNOWN_ATTEMPT_KEYS } from "./exec-guard.js";
export type { ExecGuardInput, ExecGuardResult } from "./exec-guard.js";
export { runReconcile, RECONCILE_DIRTY_HINT } from "./reconcile.js";
export type { ReconcileInput, ReconcileResultView } from "./reconcile.js";
export { runCompact } from "./compact.js";
export type {
  CompactInput,
  CompactResult,
  CompactRunEntry,
  CompactClaimEntry,
  CompactMalformedEntry,
} from "./compact.js";
export { runRecordGateRun, runRecordClaim } from "./record.js";
export type {
  RecordGateRunInput,
  RecordGateRunResult,
  RecordClaimInput,
  RecordClaimResult,
} from "./record.js";
export {
  EVIDENCE_MALFORMED_CODE,
  RUN_INGEST_ACTIONS,
  CLAIM_INGEST_ACTIONS,
} from "./evidence.js";
export type { RunIngestAction, ClaimIngestAction, EvidenceMalformed } from "./evidence.js";

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
  // 帮助/版本/用法输出统一走注入 io（commander 缺省直写 process stdout/stderr，测试与
  // 嵌入方无法捕获）；子命令经 _copyCommandSettings 继承本配置。commander 的写入 chunk
  // 已自带换行，剥掉尾部一个以抵消 io.stdout/stderr 的逐行追加（保持字节不翻倍）。
  program.configureOutput({
    writeOut: (chunk) => io.stdout(chunk.replace(/\n$/, "")),
    writeErr: (chunk) => io.stderr(chunk.replace(/\n$/, "")),
  });
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

  // —— 单对象检视（PRD §44.1 基础命令；G1 inspect hole：纯读零写入） ——
  program
    .command("inspect")
    .description(
      "单对象检视：正文+证据+谱系纯读呈现（零写入；索引行与正文缺失显式报错，A1 成对纪律；legacy 词形走 resolveAlias 收编）",
    )
    .argument("<governed-id>", "governed id（closed-world 文法；legacy 拼写自动收编解析）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (id: string, _opts, command) => {
      const outcome = await runInspect(resolveDir(command), { id });
      record({
        command: "inspect",
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

  // —— 八拍② FRAMEWORK LOCK：permit 命令面（G1；设计 docs/eight-beat-carriers-design.md §1） ——
  const permit = program
    .command("permit")
    .description(
      "八拍② FRAMEWORK LOCK：Permit 签发/判卷/显式接管/台账呈现（TTL 只按 seq 拍判定，禁墙钟）",
    );

  permit
    .command("issue")
    .description(
      "签发许可（事件写；重复签发 = PERMIT.<BASE>.n 确定性递增，无 NO_CHANGE 出口——不是幂等命令）",
    )
    .requiredOption(
      "--subject <governed-id>",
      "Permit 范围对象（closed-world governed id；可重复，≥1）",
      collectValues,
      [],
    )
    .requiredOption(
      "--actor <type>:<name>",
      "主体（type ∈ agent/human/tool/kernel；argv 自报恒 self_attested=true，C5）",
    )
    .option("--change-ref <ref>", "契约引用（general_id 宽松词形，如 CHANGE.MIGRATION_001）")
    .option("--capability <governed-id>", "Capability 清单（可重复；closed-world 校验）", collectValues, [])
    .option("--acceptance-shape <inline-json|@file>", "验收形状（JSON 对象；@file 读文件）")
    .option("--ttl-beats <n>", "TTL 拍数（正整数；缺省 168 ≈ C9 的 168h 标称节奏；禁墙钟）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runPermitIssue(resolveDir(command), {
        subjects: opts.subject as string[],
        actor: opts.actor as string,
        changeRef: opts.changeRef as string | undefined,
        capabilities: opts.capability as string[] | undefined,
        acceptanceShape: opts.acceptanceShape as string | undefined,
        ttlBeats: opts.ttlBeats as string | undefined,
      });
      record({
        command: "permit issue",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  permit
    .command("check")
    .description(
      "判卷读：四态显式（allowed/denied/expired/unknown_permit），ok = (outcome === allowed)；对过期许可追加 PERMIT_EXPIRED_OBSERVED journal 事件（kernel 契约行为）",
    )
    .requiredOption("--permit <PERMIT.*>", "许可引用（permit issue 产出）")
    .requiredOption("--subject <governed-id>", "写尝试目标对象")
    .requiredOption("--op <op>", "写尝试类型：upsert_object | transition_object | delete")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runPermitCheck(resolveDir(command), {
        permit: opts.permit as string,
        subject: opts.subject as string,
        op: opts.op as string,
      });
      record({
        command: "permit check",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  permit
    .command("steal")
    .description(
      "显式接管过期许可（D2：仅许手动 + reason 留痕；未过期 → rejected_not_expired，errors 为空）",
    )
    .requiredOption("--permit <PERMIT.*>", "许可引用")
    .requiredOption("--actor <type>:<name>", "接管主体（type ∈ agent/human/tool/kernel）")
    .requiredOption("--reason <text>", "接管理由（非空必填——接管留痕是 D2 的硬性要求）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runPermitSteal(resolveDir(command), {
        permit: opts.permit as string,
        actor: opts.actor as string,
        reason: opts.reason as string,
      });
      record({
        command: "permit steal",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  permit
    .command("list")
    .description(
      "许可台账纯读呈现（事件链按类型折叠为 {count, first_seq, last_seq}——计数保留不吞没；--json 同 state 字节稳定）",
    )
    .option("--change-ref <ref>", "按契约引用过滤（缺省=全部，不做静默过滤）")
    .option(
      "--state <state>",
      "按呈现态过滤：active | expired | stolen（CLI 局部词 TODO(vocab-pr)；缺省=全部）",
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runPermitList(resolveDir(command), {
        changeRef: opts.changeRef as string | undefined,
        state: opts.state as string | undefined,
      });
      record({
        command: "permit list",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 八拍④ EXECUTE：写路径机器执行点（G2；设计 §2） ——
  program
    .command("exec-guard")
    .description(
      "八拍④ EXECUTE 机器执行点：读 WriteAttempt JSON → checkPermit 判卷（严格判卷器非写入器：不碰目标文件、内容盲、零 daemon；非 allow 一律 exit 1，畸形输入永不放行）",
    )
    .requiredOption("--attempt <file|->", "attempt JSON 文件路径；`-` = stdin")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runExecGuard(resolveDir(command), {
        attempt: opts.attempt as string,
      });
      record({
        command: "exec-guard",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 八拍⑥ RECONCILE：delta/例外/抽样三段审阅（G3；设计 docs/eight-beat-carriers-design.md §3） ——
  program
    .command("reconcile")
    .description(
      "八拍⑥ RECONCILE：按 permit 签发基线出 delta 三段报告（changed_objects/exceptions/samples_to_review；纯读零写；clean=true 是零审阅的合法出口 exit 0，有 delta/例外 → RECONCILE_DIRTY exit 1）",
    )
    .requiredOption("--permit <PERMIT.*>", "许可引用（permit issue 产出；基线在签发瞬间存台账）")
    .option("--samples <n>", "抽样条数（≥0 整数；缺省 3；0=显式放弃抽样；stride 确定性抽样）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runReconcile(resolveDir(command), {
        permit: opts.permit as string,
        samples: opts.samples as string | undefined,
      });
      record({
        command: "reconcile",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 受控变更 / pre-dev 链编排（PRD §44.4；A2+A3：判卷权威在 kernel，CLI 只编排呈现） ——
  program
    .command("maintain")
    .description(
      "受控变更/pre-dev 链（PRD §44.4）：--ops <tx-file> 显式事务走 kernel applyTransaction（唯一写入路径，零旁移判卷）；--phase pre-dev 薄编排 triage→permit issue→context compile（串既有能力零新原语）",
    )
    .argument("<change-or-task>", "变更/任务锚（general_id 宽松词形；apply 模式缺省作为 authorityRef 兜底）")
    .option("--ops <tx-file>", "apply 模式：kernel Transaction JSON 文件（{ops:[…], authorityRef?, note?}）")
    .option("--authority-ref <ref>", "审批/决策引用（覆盖 --ops 文件内与位置参数兜底）")
    .option("--note <text>", "事务注记（覆盖 --ops 文件内同名字段）")
    .option("--phase <phase>", "编排链模式：pre-dev（triage→permit issue→context compile；in-dev/post-dev 未落地显式拒绝）")
    .option("--request <text>", "pre-dev 链：triage 请求文本")
    .option("--subject <governed-id>", "pre-dev 链：permit 范围对象（可重复，≥1）", collectValues)
    .option("--actor <type>:<name>", "pre-dev 链：permit 主体（type ∈ agent/human/tool/kernel）")
    .option("--capability <governed-id>", "pre-dev 链：Capability 清单（可重复）", collectValues)
    .option("--acceptance-shape <inline-json|@file>", "pre-dev 链：验收形状（JSON 对象；@file 读文件）")
    .option("--ttl-beats <n>", "pre-dev 链：TTL 拍数（正整数；缺省 168）")
    .option("--role <role>", "pre-dev 链：投影角色 lane（缺省不发明，必填）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (changeOrTask: string, opts, command) => {
      const outcome = await runMaintain(resolveDir(command), {
        changeOrTask,
        opsFile: opts.ops as string | undefined,
        authorityRef: opts.authorityRef as string | undefined,
        note: opts.note as string | undefined,
        phase: opts.phase as string | undefined,
        request: opts.request as string | undefined,
        subjects: opts.subject as string[] | undefined,
        actor: opts.actor as string | undefined,
        capabilities: opts.capability as string[] | undefined,
        acceptanceShape: opts.acceptanceShape as string | undefined,
        ttlBeats: opts.ttlBeats as string | undefined,
        role: opts.role as string | undefined,
      });
      record({
        command: "maintain",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 八拍⑦ COMPACT：episode 折叠为单次 store 事务（G4；设计 docs/eight-beat-carriers-design.md §4.3） ——
  program
    .command("compact")
    .description(
      "八拍⑦ COMPACT：episode 折叠——证据平面批量收编（runs/claims 按引用字典序）+ --ops 显式事务合并为单次 applyTransaction（一次 seq 推进；NO_CHANGE 是合法出口 exit 0；畸形证据走 warnings 不阻断）",
    )
    .option(
      "--ops <tx-file>",
      "kernel Transaction JSON 文件（{ops:[…], authorityRef?, note?}；追加在证据收编 op 之后）",
    )
    .option("--authority-ref <ref>", "审批/决策引用（显式给定则覆盖 --ops 文件内同名字段）")
    .option("--note <text>", "事务注记（同上覆盖语义）")
    .option("--no-ingest", "关闭证据平面批量收编（默认开启）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runCompact(resolveDir(command), {
        opsFile: opts.ops as string | undefined,
        authorityRef: opts.authorityRef as string | undefined,
        note: opts.note as string | undefined,
        noIngest: opts.ingest === false,
      });
      record({
        command: "compact",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  // —— 证据入账通路：record 显式单条（G6；设计 §4.1 裁定 B=显式单条，C=compact 批量兜底） ——
  const recordCommand = program
    .command("record")
    .description(
      "证据入账通路：把 gate 运行结果 / claim 经 store 事务显式落账 evidence 平面（check 保持纯读；入账决定权归 ⑦ 拍编排）",
    );

  recordCommand
    .command("gate-run")
    .description(
      "显式单条入账一次 gate 运行（--from GateResult JSON；GRN 缺省分配=现有最大序号+1；ran_at_seq 沿用文件自报采样点（C5），未携带才采样 store 当前 seq；同内容二次 record → SKIPPED_CANONICAL 零写入）",
    )
    .requiredOption(
      "--from <file>",
      "gate 运行结果 JSON 文件（gate_result.result 内嵌形态或 GateResult 直落顶层均可）",
    )
    .option("--grn <GRN-n>", "显式指定 GRN（同号重放按 pending 字节判定：等价→跳过，有变→canonical 化）")
    .option("--trigger <type>", "运行触发方式（run_trigger 五值闭包；缺省 on_demand；文件信封 trigger.type 优先于缺省）")
    .option("--tool <id>", "执行工具标识（缺省 pomaster-cli；文件 tool_snapshot 优先）")
    .option("--tool-version <semver>", "工具版本（缺省 CLI 版本；文件 tool_snapshot 优先）")
    .option(
      "--subject <governed-id>",
      "subject 绑定归属声明（N5：本 run 证据属于该对象；可重复；入账时机复核——通过者随事务落 journal 注记，拒者留 warnings 不入账；缺省不传 = 未声明，信封零变化）",
      collectValues,
    )
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runRecordGateRun(resolveDir(command), {
        from: opts.from as string,
        grn: opts.grn as string | undefined,
        trigger: opts.trigger as string | undefined,
        tool: opts.tool as string | undefined,
        toolVersion: opts.toolVersion as string | undefined,
        // 可重复选项不带缺省值：argv 未携带 → undefined（未声明，非显式空数组）。
        subjects: opts.subject as string[] | undefined,
      });
      record({
        command: "record gate-run",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  recordCommand
    .command("claim")
    .description(
      "显式单条入账一条 claim（record_claim 恒置 UNVERIFIED——D20：声称方不可自填 VERIFIED；已带 VERIFIED/REJECTED 等独立判定的文件 → SKIPPED_ADJUDICATED 零写入；CLM 缺省分配=现有最大序号+1）",
    )
    .requiredOption("--from <file>", "claim 输入 JSON（subject_id / assertion / asserted_by / evidence_refs）")
    .option("--clm <CLM-n>", "显式指定 CLM（同号重放按 pending 字节判定）")
    .option("--json", "machine-readable JSON output (§45)")
    .action(async (opts, command) => {
      const outcome = await runRecordClaim(resolveDir(command), {
        from: opts.from as string,
        clm: opts.clm as string | undefined,
      });
      record({
        command: "record claim",
        outcome,
        asJson: command.opts().json === true,
      });
    });

  return program;
}

/**
 * commander 选项收集器：可重复选项聚合为数组（--subject / --capability）。
 * previous 容忍 undefined（不带缺省值的可重复选项首次出现时 commander 传入 undefined
 * ——record gate-run --subject 借此区分「未声明（undefined）」与「显式空数组」，
 * 缺省不得伪装成显式声明）。
 */
function collectValues(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

/**
 * commander 信息性退出（帮助/版本请求）判定：exitOverride 把 help/version 路径也变成
 * throw，但那些是用户的正常请求（commander 已把 usage/version 写入 io.stdout），不是错误。
 */
function isInformationalCommanderExit(err: unknown): err is CommanderError {
  return (
    err instanceof CommanderError &&
    (err.code === "commander.helpDisplayed" ||
      err.code === "commander.help" ||
      err.code === "commander.version")
  );
}

/**
 * 运行 CLI（可测试入口；bin.ts 调用）。返回进程退出码：全部命令 ok=0，否则 1。
 * help/version 请求 → 输出 usage/version 后 exit 0（正常请求，绝不入 UNEXPECTED_ERROR）。
 * 用法错误（缺参/未知命令）与意外异常 → 结构化 UNEXPECTED_ERROR 信封，fail-closed exit 1
 * （绝不裸栈逃逸到机读接口）。
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
    // 帮助/版本是正常信息请求（fresh-clone 实录：--help 曾被兜底 catch 误判为
    // UNEXPECTED_ERROR 而 exit 1）——放行为 exit 0；用法错误与真异常维持 fail-closed。
    if (isInformationalCommanderExit(err)) {
      return 0;
    }
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
