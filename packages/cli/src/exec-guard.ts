/**
 * exec-guard.ts —— `pomaster exec-guard`：八拍④ EXECUTE 的机器执行点（写路径判卷）。
 *
 * 设计契约：docs/eight-beat-carriers-design.md §2。定位裁定：
 * - 「Permit 内免检」免的是人检与逐拍门禁，不免机器判卷点；本命令是最小机器执行点——
 *   单发进程、零 daemon、零编辑器 hook，agent harness 落笔前以子进程调用，exit code
 *   表达 allow/deny（非 allow 一律非零，由 runCli 的 runs.every(ok) 规则统一收敛）。
 * - 严格是判卷器，不是写入器：不读、不写、不移动目标文件（context.file_path 只是
 *   回显，连路径存在性都不查）；不调 applyTransaction、不改 store 状态（唯一例外：
 *   checkPermit 对过期许可追加 PERMIT_EXPIRED_OBSERVED journal 事件——kernel 契约
 *   行为，设计 §1.5/§2.6 已披露，不在 CLI 预检去重）；判卷输入只有三元组
 *   (permit_ref, id, op)——文件内容盲（path→governed id 绑定解析归 harness 侧与
 *   未来 binding-table 砖，P0 不做、不冒充）。
 * - 畸形输入永远不允许放行：解析失败与判卷 denied 同为 exit 1，码位可区分
 *   （ATTEMPT_MALFORMED vs PERMIT_*），harness 可对「输入坏了」与「被拒了」分别告警。
 * - 词表纪律：op 三值闭包逐字复用 kernel WriteAttempt；未知顶层键 →
 *   ATTEMPT_UNKNOWN_KEYS 告警后照常判卷（不静默丢弃、也不拒绝——拒绝破坏 harness
 *   侧前向兼容，静默丢弃违反缺席显式）；context 是 CLI 本地输入形态非治理词表。
 */

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { GovernedId } from "@pomaster/kernel";
import { checkPermit, createStore, parseGovernedId } from "@pomaster/kernel";
import type { PermitCheckResult, WriteAttempt } from "@pomaster/kernel";
import type { CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { PERMIT_WRITE_OPS, deniedReasonToCode, requireInitialized } from "./permit.js";

function isFATALCode(err: unknown): err is { reason: "unknown_prefix" | "grammar" } {
  return (
    typeof err === "object" &&
    err !== null &&
    ((err as { reason?: unknown }).reason === "unknown_prefix" ||
      (err as { reason?: unknown }).reason === "grammar")
  );
}

/** attempt 文件 P0 已知顶层键；其余键 → ATTEMPT_UNKNOWN_KEYS 告警 + 照常判卷。 */
export const KNOWN_ATTEMPT_KEYS = ["permit_ref", "id", "op", "context"] as const;

export interface ExecGuardInput {
  /** attempt JSON 文件路径；`-` = stdin。 */
  readonly attempt: string;
}

/** exec-guard 结果（outcome/reason 逐字复用 kernel PermitCheckResult 四态三因；畸形未判卷 → outcome=null）。 */
export interface ExecGuardResult {
  readonly permit_ref: string | null;
  readonly attempt: { readonly id: string; readonly op: string } | null;
  readonly outcome: "allowed" | "denied" | "expired" | "unknown_permit" | null;
  readonly reason: string | null;
  readonly hint: string | null;
  /** store 当前 seq（呈现锚，A4；禁墙钟）。 */
  readonly checked_at_seq: number | null;
  /** context 原样回显（不判卷；缺席 → null）。 */
  readonly context_echo: Readonly<Record<string, unknown>> | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 畸形输入失败出口（exit 1；码位 ATTEMPT_MALFORMED / FATAL_* 可与 PERMIT_* 区分）。 */
function malformed(
  code: string,
  message: string,
  hint: string,
  partial?: {
    readonly permitRef?: string | null;
    readonly id?: string | null;
    readonly op?: string | null;
  },
): CommandOutcome<ExecGuardResult> {
  const result: ExecGuardResult = {
    permit_ref: partial?.permitRef ?? null,
    attempt:
      partial?.id !== undefined || partial?.op !== undefined
        ? { id: partial?.id ?? "", op: partial?.op ?? "" }
        : null,
    outcome: null,
    reason: null,
    hint: null,
    checked_at_seq: null,
    context_echo: null,
  };
  return failOutcome<ExecGuardResult>("exec-guard", result, [{ code, message, hint }], [
    `exec-guard: BLOCKED — ${code}\n  message: ${message}\n  hint: ${hint}`,
  ]);
}

function verdictOutcome(
  attempt: { readonly id: string; readonly op: string },
  permitRef: string,
  verdict: PermitCheckResult,
  checkedAtSeq: number,
  contextEcho: Readonly<Record<string, unknown>> | null,
): CommandOutcome<ExecGuardResult> {
  if (verdict.outcome === "allowed") {
    const result: ExecGuardResult = {
      permit_ref: permitRef,
      attempt,
      outcome: "allowed",
      reason: null,
      hint: null,
      checked_at_seq: checkedAtSeq,
      context_echo: contextEcho,
    };
    return okOutcome("exec-guard", result, [
      `exec-guard ${permitRef} id=${attempt.id} op=${attempt.op} → allowed (checked_at_seq=${checkedAtSeq})`,
    ]);
  }
  let code: string;
  let hint: string;
  let reason: string | null = null;
  if (verdict.outcome === "denied") {
    code = deniedReasonToCode(verdict.reason);
    reason = verdict.reason;
    hint = verdict.hint;
  } else if (verdict.outcome === "expired") {
    code = "PERMIT_EXPIRED";
    hint = "TTL 已到期（seq 锚定）；显式接管走 permit steal --reason（D2），或回 FRAMEWORK LOCK 重新签发。";
  } else {
    code = "PERMIT_UNKNOWN";
    hint = "用 permit list --json 查看该引用的事件链：stolen 与从未签发都呈现为 unknown_permit（物理存在不构成放行）。";
  }
  const result: ExecGuardResult = {
    permit_ref: permitRef,
    attempt,
    outcome: verdict.outcome,
    reason,
    hint,
    checked_at_seq: checkedAtSeq,
    context_echo: contextEcho,
  };
  return failOutcome<ExecGuardResult>(
    "exec-guard",
    result,
    [
      {
        code,
        message: `exec-guard ${permitRef} id=${attempt.id} op=${attempt.op} → ${verdict.outcome}${reason === null ? "" : ` (${reason})`}`,
        hint,
      },
    ],
    [
      `exec-guard ${permitRef} id=${attempt.id} op=${attempt.op} → ${verdict.outcome}${reason === null ? "" : ` (${reason})`}`,
    ],
  );
}

/**
 * 执行 exec-guard 判卷。返回 CommandOutcome；runCli 把 ok=false 收敛为 exit 1，
 * harness 按 `case $? in 0) allow ;; *) block ;; esac` 消费。
 */
export async function runExecGuard(
  rootDir: string,
  input: ExecGuardInput,
): Promise<CommandOutcome<ExecGuardResult>> {
  // —— 1) 读取 attempt（文件或 stdin；缺失/不可读 = ATTEMPT_MALFORMED，绝不放行） ——
  let text: string;
  if (input.attempt === "-") {
    try {
      text = readFileSync(0, "utf8");
    } catch (err) {
      return malformed(
        "ATTEMPT_MALFORMED",
        `stdin 读取失败：${err instanceof Error ? err.message : String(err)}`,
        "stdin 形态要求管道传入 attempt JSON（echo … | pomaster exec-guard --attempt -）。",
      );
    }
  } else {
    try {
      text = await readFile(input.attempt, "utf8");
    } catch (err) {
      return malformed(
        "ATTEMPT_MALFORMED",
        `attempt 文件缺失或不可读：${input.attempt} — ${err instanceof Error ? err.message : String(err)}`,
        "确认 --attempt 路径存在可读，或用 - 从 stdin 读入。",
      );
    }
  }

  // —— 2) JSON 解析（非法 JSON = ATTEMPT_MALFORMED） ——
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return malformed(
      "ATTEMPT_MALFORMED",
      `attempt 不是合法 JSON：${err instanceof Error ? err.message : String(err)}`,
      "attempt 文件形如 {permit_ref, id, op, context?}（设计 §2.2）；修正 JSON 后重试。",
    );
  }
  if (!isPlainObject(parsed)) {
    return malformed(
      "ATTEMPT_MALFORMED",
      "attempt 顶层须为 JSON 对象",
      "attempt 文件形如 {permit_ref, id, op, context?}；数组/标量不是 attempt。",
    );
  }

  // —— 3) 未知顶层键：显式告警 + 照常判卷（不静默丢弃、也不拒绝） ——
  const warnings: CliWarning[] = [];
  const unknownKeys = Object.keys(parsed).filter(
    (key) => !(KNOWN_ATTEMPT_KEYS as readonly string[]).includes(key),
  );
  if (unknownKeys.length > 0) {
    warnings.push({
      code: "ATTEMPT_UNKNOWN_KEYS",
      message: `未知顶层键（照常判卷）：${unknownKeys.join(", ")}`,
      hint: "判卷面窄是安全方向：多余键不构成放行理由；P0 已知键=permit_ref/id/op/context。",
    });
  }

  // —— 4) 必填三键（permit_ref / id / op）；context 可选对象 ——
  const permitRef = parsed.permit_ref;
  if (typeof permitRef !== "string" || permitRef.length === 0) {
    return malformed(
      "ATTEMPT_MALFORMED",
      `attempt.permit_ref 缺失或非字符串：${JSON.stringify(permitRef ?? null)}`,
      "必填三键=permit_ref/id/op；permit_ref 是 permit issue 产出的 PERMIT.* 引用。",
    );
  }
  const rawId = parsed.id;
  if (typeof rawId !== "string" || rawId.length === 0) {
    return malformed(
      "ATTEMPT_MALFORMED",
      `attempt.id 缺失或非字符串：${JSON.stringify(rawId ?? null)}`,
      "必填三键=permit_ref/id/op；id 是 closed-world governed id。",
      { permitRef },
    );
  }
  const rawOp = parsed.op;
  if (typeof rawOp !== "string" || !(PERMIT_WRITE_OPS as readonly string[]).includes(rawOp)) {
    return malformed(
      "ATTEMPT_MALFORMED",
      `attempt.op 词表外值：${JSON.stringify(rawOp ?? null)}`,
      `op 三值闭包（kernel WriteAttempt）：${PERMIT_WRITE_OPS.join(" | ")}；绝不发明第四种 op。`,
      { permitRef, id: rawId },
    );
  }
  const rawContext = parsed.context;
  if (rawContext !== undefined && !isPlainObject(rawContext)) {
    return malformed(
      "ATTEMPT_MALFORMED",
      "attempt.context 存在时须为 JSON 对象",
      "context 是 CLI 本地输入形态（任意对象、原样回显不判卷）；数组/标量不是对象。",
      { permitRef, id: rawId, op: rawOp },
    );
  }

  // —— 5) id closed-world 校验（词表外前缀/文法违规 = FATAL_*，与畸形码位可区分） ——
  let id: GovernedId;
  try {
    parseGovernedId(rawId);
    id = rawId as GovernedId;
  } catch (err) {
    return malformed(
      isFATALCode(err) && err.reason === "unknown_prefix"
        ? "FATAL_UNKNOWN_PREFIX"
        : "FATAL_ID_GRAMMAR",
      err instanceof Error ? err.message : String(err),
      "closed-world 前缀闭包与 SEGMENT/SEQ 文法见 vocab-lock id_namespace（A5）；path→id 绑定解析归 harness 侧与 binding-table 砖，本命令不做。",
      { permitRef, id: rawId, op: rawOp },
    );
  }

  // —— 6) store 初始化缺席显式（NOT_INITIALIZED；createStore 会静默建账故先判） ——
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return failOutcome<ExecGuardResult>(
      "exec-guard",
      {
        permit_ref: permitRef,
        attempt: { id: rawId, op: rawOp },
        outcome: null,
        reason: null,
        hint: null,
        checked_at_seq: null,
        context_echo: (rawContext as Record<string, unknown> | undefined) ?? null,
      },
      [initialized.error],
      [`exec-guard: BLOCKED — ${initialized.error.code}\n  hint: ${initialized.error.hint}`],
    );
  }

  // —— 7) 判卷（kernel checkPermit 唯一权威；过期许可追加 journal 事件为 kernel 契约行为） ——
  try {
    const store = await createStore(rootDir);
    const verdict = await checkPermit(store, permitRef, {
      id,
      op: rawOp as WriteAttempt["op"],
    });
    const outcome = verdictOutcome(
      { id: rawId, op: rawOp },
      permitRef,
      verdict,
      store.currentSeq ?? 0,
      (rawContext as Record<string, unknown> | undefined) ?? null,
    );
    if (warnings.length > 0) {
      return { ...outcome, warnings: [...outcome.warnings, ...warnings] };
    }
    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    return failOutcome<ExecGuardResult>(
      "exec-guard",
      {
        permit_ref: permitRef,
        attempt: { id: rawId, op: rawOp },
        outcome: null,
        reason: null,
        hint: null,
        checked_at_seq: null,
        context_echo: (rawContext as Record<string, unknown> | undefined) ?? null,
      },
      [
        {
          code: typeof code === "string" ? code : "KERNEL_ERROR",
          message,
          hint: "查看 docs/kernel-api.md §4（Permit 判卷契约）；若为环境异常请勿静默降级。",
        },
      ],
      [`exec-guard: BLOCKED — ${message}`],
    );
  }
}
