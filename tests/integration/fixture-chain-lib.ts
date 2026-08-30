/**
 * fixture-chain-lib.ts —— P16 L2 三技术栈 fixture 全链共享运行器。
 *
 * 非 spec 文件（vitest include 只收 tests 下的 spec.ts；ratchet mapping 分母
 * 只对 spec 文件封闭，本文件不入账）。三个 fixture spec（git repo 最小工程 /
 * Vue3 工程 / FastAPI 工程）各自构造栈形态工程文件后，用本运行器驱动同一条
 * 八拍治理链并逐拍捕获 {exit 码, --json 信封, stdout 原文}：
 *
 *   init → triage → maintain --phase pre-dev（八拍①②③：triage→permit issue→
 *   context compile）→ reconcile（clean）→ maintain --ops upsert task（任务落账）
 *   → reconcile（dirty）→ check --gates（5 recipe GRN 入账）→ check --fast
 *   （BUILD 腿真实探测/执行）→ closeout（证据缺失阻断）→ status（终态）
 *
 * 纪律：全链命令真实 runCli（L2 的意义是集成命令面，不绕过 CLI 直调内核）；
 * 逐拍结果存档后由各 spec 的 it() 消费真实断言（本文件零断言）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { runCli, type CliEnvelope } from "@pomaster/cli";

/** 单拍执行记录：exit 码 + --json 信封（解析失败显式 null，不静默伪造）+ stdout 原文。 */
export interface StepRecord<R = Record<string, unknown>> {
  readonly code: number;
  readonly envelope: CliEnvelope<R> | null;
  readonly stdout: string;
}

/** 全链十拍的命名存档（spec 的 it() 按拍消费）。 */
export interface FixtureChain {
  readonly init: StepRecord;
  readonly triage: StepRecord;
  readonly predev: StepRecord;
  readonly reconcileClean: StepRecord;
  readonly opsApply: StepRecord;
  readonly reconcileDirty: StepRecord;
  readonly gates: StepRecord;
  readonly fast: StepRecord;
  readonly closeout: StepRecord;
  readonly status: StepRecord;
}

/** 三栈差异面（各 spec 注入）：锚/请求文本/subject/actor/lane 与 ops 事务文件路径。 */
export interface FixtureChainInput {
  readonly changeOrTask: string;
  readonly request: string;
  readonly subject: string;
  readonly actor: string;
  readonly role: string;
  readonly opsFile: string;
}

/** 跑一条 --json 命令并捕获三件套（runCli 是 L2 集成面唯一入口）。 */
export async function runJsonStep(
  root: string,
  args: readonly string[],
): Promise<StepRecord> {
  const lines: string[] = [];
  const code = await runCli(["--dir", root, ...args, "--json"], {
    stdout: (line) => lines.push(line),
    stderr: () => undefined,
  });
  const stdout = lines.join("\n");
  let envelope: CliEnvelope<Record<string, unknown>> | null = null;
  try {
    envelope = JSON.parse(stdout) as CliEnvelope<Record<string, unknown>>;
  } catch {
    envelope = null;
  }
  return { code, envelope, stdout };
}

/**
 * 信封窄化助手（spec 的 it 内使用）：信封不可解析即显式红（带 stdout 头部），
 * 绝不让后续字段断言在 null 上静默误判。
 */
export function envelopeOf(
  rec: StepRecord,
): CliEnvelope<Record<string, unknown>> {
  expect(
    rec.envelope,
    `--json 信封应可解析：${rec.stdout.slice(0, 200)}`,
  ).not.toBeNull();
  return rec.envelope as CliEnvelope<Record<string, unknown>>;
}

/** 读 .pomaster/state/truth-index.json 原文字节（纯读纪律 / 零写入断言的对比基线）。 */
export function truthIndexBytes(root: string): string {
  return readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
}

/** 读 .pomaster/state/journal.jsonl 逐行解析（留痕断言用）。 */
export function journalEvents(root: string): Record<string, unknown>[] {
  const raw = readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/**
 * task_object upsert 事务文件（kernel Transaction JSON，maintain --ops 逐字交给
 * applyTransaction；envelope camelCase 形态镜像 packages/cli/tests/closeout.spec.ts
 * 的 seedTask——task_object 硬约束 payload.class_scan_result 必填，R4）。
 * acceptance 引用一颗永不存在的 claim（CLM-9001）——closeout 段断言
 * 「证据缺失伪装完成硬阻断」（DOD_CLAIM_NOT_FOUND）。
 */
export function writeTaskUpsertOpsFile(
  opsFilePath: string,
  input: {
    readonly taskId: string;
    readonly title: string;
    readonly intent: string;
    readonly scanScope: string;
  },
): void {
  const tx = {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: input.taskId,
          kind: "task_object",
          axisProfile: "task_default",
          axes: {
            lifecycle: "CURRENT",
            confidence: "PROVISIONAL",
            evidence: "IMPLEMENTED",
            change: "STABLE",
          },
          titleZh: input.title,
          authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            intent: input.intent,
            acceptance: [
              {
                criterion: `${input.title}：验收断言经独立验证流确认`,
                claim: "CLM-9001",
              },
            ],
            class_scan_result: {
              scope: input.scanScope,
              hits: 0,
              fixed_count: 0,
              regression_case_ref: "GRN-0001",
            },
          },
        },
      },
    ],
    authorityRef: "CHANGE.FIXTURE_CHAIN",
    note: "P16 fixture 全链：task 对象落账（八拍④ EXECUTE 的受控变更面）",
  };
  writeFileSync(opsFilePath, `${JSON.stringify(tx, null, 2)}\n`, "utf8");
}

/**
 * 驱动全链十拍并逐拍存档。任何一拍的异常不吞（fixture 链是确定性序列，
 * 链中断 = fixture/环境问题，让 beforeAll 红、it 显式暴露）。
 */
export async function runFixtureChain(
  root: string,
  input: FixtureChainInput,
): Promise<FixtureChain> {
  writeTaskUpsertOpsFile(input.opsFile, {
    taskId: input.subject,
    title: `fixture 任务 ${input.subject}`,
    intent: `P16 fixture 全链验证：${input.changeOrTask}`,
    scanScope: "src/**",
  });

  const init = await runJsonStep(root, ["init"]);
  const triage = await runJsonStep(root, ["triage", input.request]);
  const predev = await runJsonStep(root, [
    "maintain",
    input.changeOrTask,
    "--phase",
    "pre-dev",
    "--request",
    input.request,
    "--subject",
    input.subject,
    "--actor",
    input.actor,
    "--role",
    input.role,
  ]);
  const permitRef =
    ((predev.envelope?.result as Record<string, unknown> | null)?.permit as
      | Record<string, unknown>
      | undefined)?.permit_ref;
  const reconcileArgs = [
    "reconcile",
    "--permit",
    typeof permitRef === "string" ? permitRef : "PERMIT.UNKNOWN.0",
  ];
  const reconcileClean = await runJsonStep(root, reconcileArgs);
  const opsApply = await runJsonStep(root, [
    "maintain",
    "CHANGE.FIXTURE_CHAIN",
    "--ops",
    input.opsFile,
  ]);
  const reconcileDirty = await runJsonStep(root, reconcileArgs);
  const gates = await runJsonStep(root, ["check", "--gates"]);
  const fast = await runJsonStep(root, ["check", "--fast"]);
  const closeout = await runJsonStep(root, ["closeout", input.subject]);
  const status = await runJsonStep(root, ["status"]);
  return {
    init,
    triage,
    predev,
    reconcileClean,
    opsApply,
    reconcileDirty,
    gates,
    fast,
    closeout,
    status,
  };
}
