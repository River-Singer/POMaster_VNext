/**
 * autopilot-escalate.ts —— `pomaster autopilot escalate record / list`：追加式纠错
 * 出口台账（TC-1b；11-11-agent-autopilot D-7 / code-spec qa-cases.md TC-1b 段）。
 *
 * 定位（D-7 逐字）：escalate 提供有依据的纠错出口，**不等于实现失败**，也**不能抹掉
 * 已有失败、删除测试或绕过授权**。自驱流程任何一环（QA 复核收不了口 / 冻结集被篡改 /
 * 削弱检测命中 / 权限不足）需要人判断时，agent 在此记账呈报——处置在人侧队列，台账
 * 本身不可变。
 *
 * 红线：
 * - **append-only**：唯一写通路 = appendFileSync 单行追加（seq = 既有行数+1）；
 *   没有 resolve / 删改 / 置回写口——TC-1b 的台账只增不改。
 * - **词形纪律**：context 闭集 qa / plan / execution / test-weakening / other
 *   （越界 SCHEMA_INVALID；other 是逃生口不是垃圾场）。
 * - **削弱检查链（复用 test-weakening，零第二套判定）**：`audit test-weakening`
 *   （既有；判定权威在 kernel detectTestWeakening，AC-08 exit 1）命中时由 driver
 *   链 `escalate record --context test-weakening` 把人阅项挂账。链式而不嵌入：audit
 *   要写 OBS sidecar（它自己的证据纪律），escalate 台账是另一条追加面——各自单一写口。
 * - 未初始化 → NOT_INITIALIZED（复用既有词形，零建账）。
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { CliError } from "./envelope.js";
import { failOutcome, okOutcome, type CommandOutcome } from "./envelope.js";
import { POMASTER_DIR } from "./store-layout.js";

/** 台账行 schema。 */
export const ESCALATION_SCHEMA = "pomaster.autopilot-escalation/v1";
/** context 闭集（越界 = SCHEMA_INVALID）。 */
export const ESCALATION_CONTEXTS = ["qa", "plan", "execution", "test-weakening", "other"] as const;
export type EscalationContext = (typeof ESCALATION_CONTEXTS)[number];

/** 台账文件（append-only jsonl；kickoff/plan/qa 平面同款 cli 本地位）。 */
export const ESCALATIONS_DIR = ".pomaster/autopilot";
export const ESCALATIONS_FILE = ".pomaster/autopilot/escalations.jsonl";

export interface EscalationEntry {
  readonly schema: typeof ESCALATION_SCHEMA;
  readonly seq: number;
  readonly id: string;
  readonly at: string;
  readonly context: EscalationContext;
  readonly subject: string;
  readonly reason_zh: string;
  readonly refs: readonly string[];
  readonly status: "open";
}

export interface EscalateRecordResult {
  readonly id: string;
  readonly seq: number;
  readonly total: number;
}
export interface EscalateListResult {
  readonly total: number;
  readonly open: number;
  readonly shown: number;
  readonly entries: readonly EscalationEntry[];
}

const fail = <T>(command: string, errors: readonly CliError[]): CommandOutcome<T | null> =>
  failOutcome<T | null>(command, null, errors, errors.map((error) => `${command}: FAILED — ${error.code}：${error.message}${error.hint !== "" ? `\n  hint: ${error.hint}` : ""}`));

function readLedger(dir: string): EscalationEntry[] {
  const path = join(dir, ...ESCALATIONS_FILE.split("/"));
  if (!existsSync(path)) return [];
  const entries: EscalationEntry[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      entries.push(JSON.parse(line) as EscalationEntry);
    } catch {
      // 台账行损坏不静默吞：跳过但在 list 时不计入（写侧 append-only 不会产生半行；
      // 半行只可能是外部手改——list 如实跳过，check 面的篡改由 digest 对账另管）。
    }
  }
  return entries;
}

/** 记账呈报：追加一行（唯一写通路）；status 恒 open（无 resolve 写口——处置在人侧）。 */
export function runAutopilotEscalateRecord(dir: string, input: { readonly context?: string; readonly subject?: string; readonly reason?: string; readonly refs?: readonly string[] }): CommandOutcome<EscalateRecordResult | null> {
  const command = "autopilot escalate record";
  if (!existsSync(join(dir, ...POMASTER_DIR.split("/")))) {
    return fail(command, [{ code: "NOT_INITIALIZED", message: `no pomaster state found at ${POMASTER_DIR}`, hint: "run: pomaster init / createStore 后重试（缺席显式，不静默建账）。" }]);
  }
  if (input.subject === undefined || input.subject.trim() === "") {
    return fail(command, [{ code: "AUTOPILOT_ESCALATE_SUBJECT_REQUIRED", message: "--subject 缺席（呈报要指向具体对象：CASE-…/TASK.…/文件/代码位）", hint: "例：autopilot escalate record --context qa --subject CASE-0012 --reason \"预期结果与原型冲突，需要人裁定\"" }]);
  }
  if (input.reason === undefined || input.reason.trim() === "") {
    return fail(command, [{ code: "AUTOPILOT_ESCALATE_REASON_REQUIRED", message: "--reason 缺席（有依据的纠错出口：没有依据的呈报不算 escalate）", hint: "写清发现什么、为什么超出 agent 权限、建议人怎么裁" }]);
  }
  const context = input.context ?? "other";
  if (!(ESCALATION_CONTEXTS as readonly string[]).includes(context)) {
    return fail(command, [{ code: "SCHEMA_INVALID", message: `--context「${context}」不在闭集（${ESCALATION_CONTEXTS.join(" / ")}）`, hint: "越界词形进不了台账；other 是逃生口不是垃圾场" }]);
  }

  const existing = readLedger(dir);
  const seq = existing.length + 1;
  const id = `ESC-${String(seq).padStart(4, "0")}`;
  const entry: EscalationEntry = {
    schema: ESCALATION_SCHEMA,
    seq,
    id,
    at: new Date().toISOString(),
    context: context as EscalationContext,
    subject: input.subject.trim(),
    reason_zh: input.reason.trim(),
    refs: input.refs ?? [],
    status: "open",
  };
  mkdirSync(join(dir, ...ESCALATIONS_DIR.split("/")), { recursive: true });
  appendFileSync(join(dir, ...ESCALATIONS_FILE.split("/")), `${JSON.stringify(entry)}\n`, "utf8");
  const human = [
    `autopilot escalate record: ESC-#### ${id} — ${entry.subject}（${entry.context}）`,
    `  ${entry.reason_zh}`,
    "  status open；台账 append-only（没有 resolve/删改口）——处置在人侧队列，不等于实现失败，不能抹已有失败",
  ];
  return okOutcome(command, { id, seq, total: seq }, human);
}

/** 纯读呈现：全部或仅 open；空台账显式呈现（非空白假绿）。 */
export function runAutopilotEscalateList(dir: string, input: { readonly open?: boolean } = {}): CommandOutcome<EscalateListResult | null> {
  const command = "autopilot escalate list";
  if (!existsSync(join(dir, ...POMASTER_DIR.split("/")))) {
    return fail(command, [{ code: "NOT_INITIALIZED", message: `no pomaster state found at ${POMASTER_DIR}`, hint: "run: pomaster init / createStore 后重试（缺席显式，不静默建账）。" }]);
  }
  const entries = readLedger(dir);
  const open = entries.filter((entry) => entry.status === "open");
  const shown = input.open === true ? open : entries;
  const human = shown.length === 0
    ? [`autopilot escalate list: 0 entries${input.open === true ? "（open）" : ""}——台账空是显式事实（无人阅项挂账）`]
    : [`autopilot escalate list: ${shown.length} entries（共 ${entries.length}，open ${open.length}）`];
  for (const entry of shown) {
    human.push(`  ${entry.id} · ${entry.context} · ${entry.subject} · ${entry.status}`);
    human.push(`    ${entry.reason_zh}`);
    if (entry.refs.length > 0) human.push(`    refs: ${entry.refs.join("、")}`);
  }
  return okOutcome(command, { total: entries.length, open: open.length, shown: shown.length, entries: shown }, human);
}
