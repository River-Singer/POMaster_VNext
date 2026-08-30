/**
 * ledger.ts —— `pomaster ledger` Exception Ledger 命令面（§49.2 入账 + 呈现）。
 *
 * - ledger record：异常条目入账——判卷/分配权威在 kernel recordException（台账
 *   侧车 state/exception-ledger.json + journal EXCEPTION_RECORDED 事件流；本命令
 *   只做 argv 收敛与呈现，禁旁移写台账）。入账非幂等（同 permit issue 先例：
 *   EXC-n 确定性递增，重复登记 = 新条目——静默去重会吞掉重复申报信号）。
 * - ledger list：台账纯读呈现（不调 createStore；损坏 SCHEMA_INVALID 显式）。
 *
 * 词形纪律：classification 五值闭包（§49.2 逐字语义；词形大写化对齐 §91.3），
 * 词表外 argv 显式拒绝（SCHEMA_INVALID）——kernel recordException 二次判卷兜底。
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GovernanceError } from "@pomaster/kernel";
import type { Store } from "@pomaster/kernel";
import type { Actor } from "@pomaster/kernel";
import { EXCEPTION_CLASSIFICATION_VALUES } from "@pomaster/schemas";
import type { CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, parseActorArgv, requireInitialized } from "./permit.js";
import { POMASTER_DIR, toPosix } from "./store-layout.js";

type UnknownRecord = Record<string, unknown>;

// ============================================================
// ledger record（入账）
// ============================================================

export interface LedgerRecordInput {
  readonly classification: string;
  readonly statement: string;
  readonly objectRef?: string;
  readonly changeRef?: string;
  readonly actor: string;
  readonly note?: string;
}

export interface LedgerRecordResult {
  readonly ledger_ref: string;
  readonly classification: string;
  readonly statement: string;
  readonly object_ref: string | null;
  readonly change_ref: string | null;
  readonly recorded_at_seq: number;
}

/** kernel 所需最小面（结构化类型；缺省 = @pomaster/kernel 真实导出）。 */
export interface LedgerKernelDeps {
  createStore: (rootDir: string) => Promise<Store>;
  recordException: (
    store: Store,
    input: {
      classification: string;
      statement: string;
      objectRef?: string;
      changeRef?: string;
      recordedBy: Actor;
      note?: string;
    },
  ) => Promise<UnknownRecord>;
}

export async function runLedgerRecord(
  rootDir: string,
  input: LedgerRecordInput,
  deps?: Partial<LedgerKernelDeps>,
): Promise<CommandOutcome<LedgerRecordResult>> {
  const emptyResult: LedgerRecordResult = {
    ledger_ref: "",
    classification: input.classification,
    statement: input.statement,
    object_ref: input.objectRef ?? null,
    change_ref: input.changeRef ?? null,
    recorded_at_seq: 0,
  };

  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return failOutcome("ledger record", emptyResult, [initialized.error], [
      `ledger record: FAILED — ${initialized.error.code}\n  hint: ${initialized.error.hint}`,
    ]);
  }
  const actor = parseActorArgv(input.actor);
  if ("error" in actor) {
    return failOutcome("ledger record", emptyResult, [actor.error], [
      `ledger record: FAILED — ${actor.error.code}\n  hint: ${actor.error.hint}`,
    ]);
  }
  if (input.statement.trim().length === 0) {
    return failOutcome(
      "ledger record",
      emptyResult,
      [
        {
          code: "SCHEMA_INVALID",
          message: "--statement 为空（§49.2 异常陈述必填）",
          hint: "给出精确、可判定的异常事实陈述（「待定」不是陈述）。",
        },
      ],
      ["ledger record: FAILED — SCHEMA_INVALID\n  hint: --statement 必填（精确、可判定）。"],
    );
  }

  const kernel: LedgerKernelDeps = {
    createStore:
      deps?.createStore ??
      ((async (root: string) => {
        const mod = await import("@pomaster/kernel");
        return mod.createStore(root);
      }) as LedgerKernelDeps["createStore"]),
    recordException:
      deps?.recordException ??
      ((async (store: Store, recordInput: Parameters<LedgerKernelDeps["recordException"]>[1]) => {
        const mod = await import("@pomaster/kernel");
        return (await mod.recordException(store, {
          classification: recordInput.classification,
          statement: recordInput.statement,
          objectRef: recordInput.objectRef,
          changeRef: recordInput.changeRef,
          recordedBy: recordInput.recordedBy,
          note: recordInput.note,
        })) as unknown as UnknownRecord;
      }) as LedgerKernelDeps["recordException"]),
  };

  try {
    const store = await kernel.createStore(rootDir);
    const entry = await kernel.recordException(store, {
      classification: input.classification,
      statement: input.statement,
      objectRef: input.objectRef,
      changeRef: input.changeRef,
      recordedBy: actor.actor,
      note: input.note,
    });
    const result: LedgerRecordResult = {
      ledger_ref: String(entry.ledger_ref ?? ""),
      classification: String(entry.classification ?? input.classification),
      statement: String(entry.statement ?? input.statement),
      object_ref: entry.object_ref === null || entry.object_ref === undefined ? null : String(entry.object_ref),
      change_ref: entry.change_ref === null || entry.change_ref === undefined ? null : String(entry.change_ref),
      recorded_at_seq: typeof entry.recorded_at_seq === "number" ? entry.recorded_at_seq : 0,
    };
    const human = [
      `ledger record → ${result.ledger_ref} (${result.classification}, seq=${result.recorded_at_seq})`,
      `  statement: ${result.statement}`,
      `  object_ref: ${result.object_ref ?? "(none)"} | change_ref: ${result.change_ref ?? "(none)"}`,
      `  台账: ${toPosix(".pomaster/state/exception-ledger.json")} + journal EXCEPTION_RECORDED`,
    ];
    return okOutcome("ledger record", result, human);
  } catch (err) {
    const error =
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : {
            code: "KERNEL_ERROR",
            message: err instanceof Error ? err.message : String(err),
            hint: "查看 docs/kernel-api.md 对应契约；若为环境异常请勿静默降级。",
          };
    return failOutcome("ledger record", emptyResult, [error], [
      `ledger record: FAILED — ${error.code}\n  hint: ${error.hint}`,
    ]);
  }
}

// ============================================================
// ledger list（纯读呈现）
// ============================================================

export interface LedgerListEntry {
  readonly ledger_ref: string;
  readonly classification: string;
  readonly statement: string;
  readonly object_ref: string | null;
  readonly change_ref: string | null;
  readonly recorded_by: string | null;
  readonly recorded_at_seq: number | null;
}

export interface LedgerListResult {
  readonly total: number;
  readonly filtered: number;
  readonly classification_filter: string | null;
  readonly entries: readonly LedgerListEntry[];
}

export async function runLedgerList(
  rootDir: string,
  input: { readonly classification?: string },
): Promise<CommandOutcome<LedgerListResult>> {
  const classificationFilter = input.classification?.trim() ? input.classification.trim() : null;
  const path = join(rootDir, POMASTER_DIR, "state", "exception-ledger.json");

  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    const result: LedgerListResult = {
      total: 0,
      filtered: 0,
      classification_filter: classificationFilter,
      entries: [],
    };
    return okOutcome("ledger list", result, [
      "ledger list → 0 entries（台账缺席：opt-in 登记面，尚无异常登记——显式空，不伪装成「无异常」）",
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return failOutcome(
      "ledger list",
      { total: 0, filtered: 0, classification_filter: classificationFilter, entries: [] },
      [
        {
          code: "SCHEMA_INVALID",
          message: `state/exception-ledger.json 无法解析（损坏或手改）：${(err as Error).message}`,
          hint: "台账由 kernel recordException 维护；从 git 恢复后重试，禁手改。",
        },
      ],
      ["ledger list: FAILED — SCHEMA_INVALID"],
    );
  }
  if (parsed === null || typeof parsed !== "object" || !Array.isArray((parsed as UnknownRecord).entries)) {
    return failOutcome(
      "ledger list",
      { total: 0, filtered: 0, classification_filter: classificationFilter, entries: [] },
      [
        {
          code: "SCHEMA_INVALID",
          message: "state/exception-ledger.json 结构非法（entries 非数组）",
          hint: "台账由 kernel recordException 维护；从 git 恢复后重试。",
        },
      ],
      ["ledger list: FAILED — SCHEMA_INVALID"],
    );
  }

  const warnings: CliWarning[] = [];
  const entries: LedgerListEntry[] = [];
  for (const item of (parsed as UnknownRecord).entries as unknown[]) {
    if (item === null || typeof item !== "object") {
      warnings.push({
        code: "SCHEMA_INVALID",
        message: "exception-ledger 存在非对象条目，已跳过（显式呈现不吞没）",
        hint: "台账由 kernel recordException 维护；从 git 恢复后重试。",
      });
      continue;
    }
    const entry = item as UnknownRecord;
    entries.push({
      ledger_ref: String(entry.ledger_ref ?? "EXC-?"),
      classification: String(entry.classification ?? "?"),
      statement: String(entry.statement ?? "(missing)"),
      object_ref: entry.object_ref == null ? null : String(entry.object_ref),
      change_ref: entry.change_ref == null ? null : String(entry.change_ref),
      recorded_by:
        entry.recorded_by !== null && typeof entry.recorded_by === "object"
          ? `${String((entry.recorded_by as UnknownRecord).actor_type ?? "?")}:${String((entry.recorded_by as UnknownRecord).actor ?? "?")}`
          : null,
      recorded_at_seq: typeof entry.recorded_at_seq === "number" ? entry.recorded_at_seq : null,
    });
  }

  const filtered =
    classificationFilter === null
      ? entries
      : entries.filter((entry) => entry.classification === classificationFilter);
  if (classificationFilter !== null) {
    const known = (EXCEPTION_CLASSIFICATION_VALUES as readonly string[]).includes(classificationFilter);
    if (!known) {
      warnings.push({
        code: "SCHEMA_INVALID",
        message: `--classification 词表外：${classificationFilter}（过滤空结果不等于校验通过）`,
        hint: `§49.2 五分类闭包：${EXCEPTION_CLASSIFICATION_VALUES.join(" | ")}。`,
      });
    }
  }
  const sorted = [...filtered].sort((a, b) => {
    const na = Number.parseInt(a.ledger_ref.slice("EXC-".length), 10);
    const nb = Number.parseInt(b.ledger_ref.slice("EXC-".length), 10);
    return na - nb;
  });

  const result: LedgerListResult = {
    total: entries.length,
    filtered: sorted.length,
    classification_filter: classificationFilter,
    entries: sorted,
  };
  const human = [
    `ledger list → ${sorted.length} entries（total=${result.total}${classificationFilter === null ? "" : `，filter=${classificationFilter}`}）`,
    ...sorted.map(
      (entry) =>
        `  ${entry.ledger_ref} [${entry.classification}] ${entry.statement}` +
        `（object=${entry.object_ref ?? "-"} change=${entry.change_ref ?? "-"} seq=${entry.recorded_at_seq ?? "?"} by=${entry.recorded_by ?? "?"}）`,
    ),
  ];
  return okOutcome("ledger list", result, human, warnings);
}
