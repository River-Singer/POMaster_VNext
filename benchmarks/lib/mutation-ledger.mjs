/**
 * mutation-ledger.mjs —— benchmarks/mutation-kill.mjs 的入账核心（可测面；vitest 测试面
 * tests/mutation-ledger.spec.ts 用真实 kernel 对同一批导出对账）。
 *
 * 定位（Owner 决议 2026-09-01：批准「mutation 基准轮 gate record 入正式账本」）：
 * 基准轮测量产出的 gate record（GRN 词形，gauntlet-lite normalizeMutationLeg 判卷锚）
 * 不再只是 results JSON 里的一个字段——经 kernel applyTransaction 的 record_gate_run op
 * 落进本仓 REPO_ROOT/.pomaster store（evidence/runs/<GRN>.json + journal TX_APPLIED 锚），
 * 成为正式治理事实。benchmarks/mutation-last-results.json 照旧是基准报告文件；store 账本
 * 是新增的正式事实面——两者并存（results note 同步披露）。
 *
 * 纪律落点：
 * - CLAIMED：入账必经 applyTransaction（零旁路直写 evidence/runs）；
 * - 幂等/重跑：kernel applyRecordGateRun 对重复 GRN **无守卫**（新事务同 GRN 会静默
 *   覆盖 run 文件；仅「同 ops/authorityRef/note 的整事务重放」走 inputs_fingerprint
 *   短路）——因此本模块在入账前显式预检 evidence/runs/<GRN>.json：
 *     · 缺席 → 正常入账；
 *     · 在座且与本次 gate record 全同（canonical 逐字段）→ already_entered 零写入
 *       （NO_CHANGE 语义，harness 输出显式披露）；
 *     · 在座但内容不同 → GRN_CONFLICT fail-closed（重复入账禁静默双写）。
 *   预检采用**全字段 canonical 对等**（含 durationMs）：verify 面按同一全量词形对账，
 *   宽松子集比较会造出「verify 对 results 与 store 各认一半」的分裂真相面。
 *   边界披露：入账成功后 results 落盘前崩溃、且重跑测量产出不同 durationMs 的罕见
 *   场景下，同 seq 同 GRN 会命中 GRN_CONFLICT——恢复动作=校正
 *   benchmarks/mutation-last-results.json 的 seq 越过已绑定 GRN（seq 只要求单调，允许
 *   跳号）后重跑；账本中已入账的 GRN 事实不受影响。
 * - 失败语义 fail-closed：一切入账失败（store 初始化 / 事务拒绝 / GRN 冲突 / 词形非法 /
 *   run 文件损坏）抛 LedgerEntryError 且 exitCode=2——测量成功但账本写入失败不能静默绿。
 * - 依赖注入：kernel 三件（createStore / applyTransaction / gateResultToSnake）由调用方
 *   注入（harness 消费 packages/kernel/dist，测试经 vitest alias 消费 src）——判卷与落盘
 *   词形的单一实现权威在 kernel，本模块零复写（verifyMutationResults deps 注入同款纪律）。
 * - 无墙钟：tx.note 是确定性常量（参与 inputs_fingerprint，须重放稳定）；时间戳禁入
 *   一切落盘身份字段（seq 整数序标识）。
 *
 * 本机账本披露：REPO_ROOT/.pomaster 已加入 .gitignore（保守裁定——账本留本机不入 git；
 * 仓库无既有相反政策）。store 未初始化时由 createStore 幂等建 skeleton（authority 骨架
 * 按默认；record_gate_run 不需要 authority owner）。
 *
 * --verify 分层语义（Owner 设计修正 2026-09-01：账本对账按环境依赖分层，两环境都严格
 * 判卷——禁放宽断言换绿）：
 * - 判卷工件自身校验（gate_record 词形）环境无关，任何环境 fail-closed——置于跳过判定
 *   之前（备选排序会让 gate_record 损坏的 results 在 fresh clone 假绿，属放宽，禁）；
 * - 账本在账对账（run 文件在账 + journal 锚 + 全量一致）环境相关：store 在座 → 必查
 *   fail-closed（GRN 缺席/失配照旧红）；store 缺席 → 显式披露跳过（ledgerSkipDisclosure，
 *   harness 原样 stdout）而非静默——判卷锚重放层（mutation-harness-core 的
 *   verifyMutationResults，环境无关 fail-closed）已在该层全绿兜底判卷。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** record_gate_run 的 trigger 词形（structural 词表 RUN_TRIGGER_VALUES 成员）。 */
export const LEDGER_TRIGGER = "on_demand";

/**
 * 事务 note（确定性常量——参与 inputs_fingerprint，禁含墙钟/随机内容）。
 */
export const LEDGER_TX_NOTE =
  "benchmarks/mutation-kill.mjs 基准轮 gate record 入账（Owner 决议 2026-09-01 批准入正式账本）";

/** GRN 词形（与 kernel applyRecordGateRun / normalizeGateResult 同一闭集词形）。 */
const GRN_RE = /^GRN-[0-9]+$/;

/**
 * 入账失败（fail-closed 词形）：exitCode 恒 2（harness 顶层按它落退出码）。
 * code 闭集：RECORD_INVALID / GRN_WORDFORM_INVALID / RUN_FILE_UNREADABLE /
 * GRN_CONFLICT / STORE_INIT_FAILED / TX_REJECTED。
 */
export class LedgerEntryError extends Error {
  /**
   * @param {string} code 机器可辨错误码（上列闭集）。
   * @param {string} message 一句话缺陷描述（含修复路标所需的现场信息）。
   * @param {string | null} [hint] 修复指引（escalation 纪律：不说去哪修的报错是缺陷）。
   */
  constructor(code, message, hint = null) {
    super(message);
    this.name = "LedgerEntryError";
    this.code = code;
    this.hint = hint;
    this.exitCode = 2;
  }
}

/**
 * canonical JSON（递归按 key 码元序排序、无空白）——仅用于**相等性比较**（入账预检与
 * verify 对账），不是身份哈希：身份哈希权威在 kernel digest.ts（sha256OfCanonical），
 * 本模块不复制第二套哈希面。
 *
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  const keys = Object.keys(record).sort();
  const body = keys
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${body.join(",")}}`;
}

/**
 * store 物理布局（镜像 kernel paths.buildStorePaths 的 <rootDir>/.pomaster 契约布局；
 * kernel 未公共导出 paths——此处的三处路径与契约 §1 一致，测试面用真实 kernel 落盘
 * 逐字节钉死两者不漂移）。
 *
 * @param {string} storeRoot store 根目录（REPO_ROOT；.pomaster 挂其下）。
 */
export function storeLayout(storeRoot) {
  const pomasterDir = join(storeRoot, ".pomaster");
  return {
    pomasterDir,
    runsDir: join(pomasterDir, "evidence", "runs"),
    journalPath: join(pomasterDir, "state", "journal.jsonl"),
    /**
     * @param {string} grn
     */
    runFile(grn) {
      return join(this.runsDir, `${grn}.json`);
    },
  };
}

/**
 * store 缺席时的显式跳过披露（分层语义单一措辞源：harness --verify 原样 stdout，
 * 测试面钉内容——跳过必须显式、禁静默）。.pomaster 是 Owner 决议的本机账本
 * （.gitignore 排除不入 git），fresh clone 无 store 属预期形态——此时账本在账对账层
 * 无法执行，判卷锚重放层（verifyMutationResults，环境无关 fail-closed）已全绿兜底。
 *
 * @param {string} grn results 声称的 GRN。
 * @returns {string}
 */
export function ledgerSkipDisclosure(grn) {
  return `账本对账跳过：本机 store 缺席（.pomaster 为 Owner 决议的本机账本，不入 git——fresh clone 属预期形态），判卷锚重放层已全绿；results 声称 GRN ${grn} 的在账对账未执行（显式披露非静默；store 建立后重跑 --verify 即补全对账）`;
}

/**
 * gate record → applyTransaction 事务（record_gate_run op；op 词形/必需字段与 kernel
 * store.applyRecordGateRun 逐字对齐：grn + result（GateResult 全量）+ trigger；
 * subject_id=null / trigger=on_demand 由调用方的 record 与本常量承载）。
 * 本函数只做薄词形校验（对象形态 + GRN 词形）——verdict/counts/Q3 等重词表校验的
 * 单一权威在 kernel（applyRecordGateRun 会再拒一次，fail-closed 双道）。
 *
 * @param {Record<string, unknown>} record normalizeMutationLeg 产出的 GateResult 词形 gate record。
 * @returns {{ ops: readonly [{ op: "record_gate_run", run: { grn: string, result: Record<string, unknown>, trigger: typeof LEDGER_TRIGGER } }], note: string }}
 */
export function buildGateRunTx(record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    throw new LedgerEntryError(
      "RECORD_INVALID",
      `gate record 不是对象（normalizeMutationLeg 词形要求 object）：${String(record)}`,
      "检查 gauntlet-lite normalizeMutationLeg 的返回词形后再重跑",
    );
  }
  if (typeof record.grn !== "string" || !GRN_RE.test(record.grn)) {
    throw new LedgerEntryError(
      "GRN_WORDFORM_INVALID",
      `gate record.grn 词形非法（须 GRN-[0-9]+）：${String(record.grn)}`,
      "GRN 由 results seq 分配（GRN-<seq>）；检查 results seq 词形与 plan.grn 组装",
    );
  }
  return {
    ops: [
      {
        op: "record_gate_run",
        run: { grn: record.grn, result: record, trigger: LEDGER_TRIGGER },
      },
    ],
    note: LEDGER_TX_NOTE,
  };
}

/**
 * store.applyRecordGateRun 的落盘词形镜像（07 run_record canonical 形态）：入账预检与
 * verify 用同一镜像函数对账——镜像点唯一，禁在第二处复写 assembly。
 *
 * @param {Record<string, unknown>} record
 * @param {(result: Record<string, unknown>) => Record<string, unknown>} gateResultToSnake kernel 注入。
 * @returns {Record<string, unknown>}
 */
export function expectedStoreRunRecord(record, gateResultToSnake) {
  return {
    record_type: "run",
    grn: record.grn,
    ran_at_seq: record.ranAtSeq,
    trigger: { type: LEDGER_TRIGGER },
    gate_result: { mode: "inline", result: gateResultToSnake(record) },
  };
}

/**
 * 读在座 run 文件（不存在 → null；存在但不可解析 → LedgerEntryError fail-closed——
 * 损坏文件禁被静默覆盖，先人工处置再重跑）。
 *
 * @param {ReturnType<typeof storeLayout>} layout
 * @param {string} grn
 * @returns {Record<string, unknown> | null}
 */
function readRunRecord(layout, grn) {
  const path = layout.runFile(grn);
  if (!existsSync(path)) return null;
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new LedgerEntryError(
      "RUN_FILE_UNREADABLE",
      `在座 run 文件不可读：${path}（${String(error)}）`,
      "检查文件占用/权限后重跑；损坏文件先人工处置（禁被入账静默覆盖）",
    );
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new SyntaxError("run record root is not an object");
    }
    return /** @type {Record<string, unknown>} */ (parsed);
  } catch (error) {
    throw new LedgerEntryError(
      "RUN_FILE_UNREADABLE",
      `在座 run 文件无法解析为 JSON 对象（损坏或手改）：${path}（${String(error)}）`,
      "从 store 快照恢复或删除该文件后重跑；禁被入账静默覆盖",
    );
  }
}

/**
 * 入账预检差异列表（在座 run 文件 vs 本次期望词形；空数组 = 全同）。
 * 全字段口径（含 durationMs）——理由见文件头注「幂等/重跑」。
 *
 * @param {Record<string, unknown>} existing
 * @param {Record<string, unknown>} expected expectedStoreRunRecord 产物。
 * @returns {string[]}
 */
function runRecordDiff(existing, expected) {
  const diffs = [];
  if (existing.record_type !== expected.record_type) {
    diffs.push(`record_type: 在座=${JSON.stringify(existing.record_type ?? null)} 期望=${JSON.stringify(expected.record_type)}`);
  }
  if (existing.grn !== expected.grn) {
    diffs.push(`grn: 在座=${JSON.stringify(existing.grn ?? null)} 期望=${JSON.stringify(expected.grn)}`);
  }
  if (existing.ran_at_seq !== expected.ran_at_seq) {
    diffs.push(`ran_at_seq: 在座=${JSON.stringify(existing.ran_at_seq ?? null)} 期望=${JSON.stringify(expected.ran_at_seq)}`);
  }
  const existingTrigger = /** @type {Record<string, unknown> | undefined} */ (existing.trigger);
  const expectedTrigger = /** @type {Record<string, unknown>} */ (expected.trigger);
  if (existingTrigger?.type !== expectedTrigger.type) {
    diffs.push(`trigger.type: 在座=${JSON.stringify(existingTrigger?.type ?? null)} 期望=${JSON.stringify(expectedTrigger.type)}`);
  }
  const existingInline = /** @type {Record<string, unknown> | undefined} */ (existing.gate_result);
  const expectedInline = /** @type {Record<string, unknown>} */ (expected.gate_result);
  if (existingInline?.mode !== expectedInline.mode) {
    diffs.push(`gate_result.mode: 在座=${JSON.stringify(existingInline?.mode ?? null)} 期望=${JSON.stringify(expectedInline.mode)}`);
  }
  if (canonicalJson(existingInline?.result) !== canonicalJson(expectedInline.result)) {
    diffs.push("gate_result.result 内容 canonical 对账不一致（verdict/counts/口径等字段存在差异）");
  }
  return diffs;
}

/**
 * 把 gate record 入本仓 store 账本（幂等初始化 store + 重复 GRN 显式处理 + record_gate_run
 * 事务）。全部失败以 LedgerEntryError（exitCode=2）抛出——调用方 fail-closed。
 *
 * @param {object} args
 * @param {Record<string, unknown>} args.record normalizeMutationLeg 产出的 gate record。
 * @param {string} args.storeRoot store 根目录（REPO_ROOT；.pomaster 挂其下）。
 * @param {{ createStore: Function, applyTransaction: Function, gateResultToSnake: Function }} args.kernel
 *     kernel 依赖注入（harness=dist 词形；测试=vitest alias src）。
 * @returns {Promise<{ status: "entered", grn: string, appliedSeq: number, shortCircuited: boolean } | { status: "already_entered", grn: string }>}
 */
export async function enterGateRecordInStore({ record, storeRoot, kernel }) {
  if (typeof kernel?.createStore !== "function" || typeof kernel?.applyTransaction !== "function" || typeof kernel?.gateResultToSnake !== "function") {
    throw new LedgerEntryError(
      "STORE_INIT_FAILED",
      "kernel 依赖注入不完整（须 createStore / applyTransaction / gateResultToSnake 三件）",
      "harness 侧确认 packages/kernel/dist/index.js 已构建（node scripts/build-all.mjs）",
    );
  }
  // 薄词形校验先行（抛 LedgerEntryError）——任何 store 触碰之前 fail-closed。
  const tx = buildGateRunTx(record);
  const grn = /** @type {string} */ (record.grn);
  const layout = storeLayout(storeRoot);

  // —— 重复 GRN 显式处理（kernel 对重复 GRN 无守卫：新事务同 GRN 会静默覆盖 run 文件
  // ——预检在此封死「静默双写」；同内容 already_entered 零写入，异内容冲突 fail-closed）。
  const existing = readRunRecord(layout, grn);
  if (existing !== null) {
    const expected = expectedStoreRunRecord(record, kernel.gateResultToSnake);
    const diffs = runRecordDiff(existing, expected);
    if (diffs.length === 0) {
      return { status: "already_entered", grn };
    }
    throw new LedgerEntryError(
      "GRN_CONFLICT",
      `GRN ${grn} 已绑定另一份 gate record（重复入账禁静默双写——fail-closed）：${diffs.join("; ")}`,
      "GRN 由 results seq 分配：先校正 benchmarks/mutation-last-results.json 的 seq 越过已绑定 GRN（seq 只要求单调，允许跳号）再重跑测量；账本中已入账的 GRN 事实不受影响",
    );
  }

  // —— store 幂等初始化（已存在不重复 init；无 store 时建 skeleton，authority 骨架按默认
  // ——record_gate_run 不需要 authority owner，见 kernel store.applyRecordGateRun）。
  let store;
  try {
    store = await kernel.createStore(storeRoot);
  } catch (error) {
    throw new LedgerEntryError(
      "STORE_INIT_FAILED",
      `store 初始化/打开失败：${String(error?.message ?? error)}`,
      error?.hint ?? "检查磁盘可写性与 .pomaster 状态后重跑",
    );
  }

  // —— 唯一写入路径：applyTransaction（CLAIMED 纪律；evidence/runs/<GRN>.json +
  // journal TX_APPLIED 由 kernel 统一落盘，本模块零旁路直写）。
  let txResult;
  try {
    txResult = await kernel.applyTransaction(store, tx);
  } catch (error) {
    const innerCode = typeof error?.code === "string" ? `(${error.code})` : "";
    throw new LedgerEntryError(
      "TX_REJECTED",
      `applyTransaction 拒绝 record_gate_run${innerCode}：${String(error?.message ?? error)}`,
      error?.hint ?? "按 kernel 报错路标修正 gate record 词形后重跑",
    );
  }
  return {
    status: "entered",
    grn,
    appliedSeq: txResult.appliedSeq,
    shortCircuited: txResult.shortCircuited === true,
  };
}

/**
 * journal.jsonl 事件读取（一行一 JSON；空行跳过；不可解析行 → problem 记录不静默）。
 *
 * @param {string} journalPath
 * @param {string[]} problems 检出问题累积器。
 * @returns {Record<string, unknown>[]}
 */
function readJournalEvents(journalPath, problems) {
  if (!existsSync(journalPath)) {
    problems.push(`journal 不在位：${journalPath}（TX_APPLIED 锚不可核——store 账本面缺失）`);
    return [];
  }
  let text;
  try {
    text = readFileSync(journalPath, "utf8");
  } catch (error) {
    problems.push(`journal 不可读：${String(error)}`);
    return [];
  }
  const events = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        events.push(/** @type {Record<string, unknown>} */ (parsed));
      }
    } catch {
      problems.push("journal 存在无法解析的事件行（损坏或手改）——TX_APPLIED 锚不可核");
    }
  }
  return events;
}

/**
 * --verify 的账本一致性面（分层语义）：校验 store 内该 GRN 在账（evidence/runs/<GRN>.json +
 * journal TX_APPLIED 锚）且与 results.gate_record 一致。零写入纯读；失配逐条列入 problems。
 *
 * 分层（Owner 设计修正 2026-09-01；两环境都严格判卷）：
 * - gate_record 词形校验（缺席/GRN 词形非法）：results 工件自身缺陷，环境无关——任何
 *   环境 fail-closed，置于 store 缺席跳过判定之前（备选排序会让损坏 results 在
 *   fresh clone 假绿，属放宽断言换绿，禁）；
 * - 账本在账对账：仅当 store 在座（<storeRoot>/.pomaster 目录在座）执行，GRN 缺席/
 *   内容失配/锚缺席照旧 fail-closed；store 缺席 → ok=true + skipped=true + disclosure
 *   （ledgerSkipDisclosure 显式披露，harness 原样 stdout——跳过禁静默）。
 *
 * 口径披露：journal TX_APPLIED 事件不携带 GRN（kernel 事件词形只有 ops 词形数组），GRN
 * 的机器锚是 run 文件本体；journal 锚证明该写入经 applyTransaction 通路（CLAIMED 纪律）
 * 而非旁路直写。results.ledger_entry.applied_seq 在座时做精确事件锚匹配（seq + ops）。
 *
 * @param {object} args
 * @param {Record<string, unknown>} args.results mutation-last-results.json 解析产物。
 * @param {string} args.storeRoot store 根目录（REPO_ROOT）。
 * @param {(result: Record<string, unknown>) => Record<string, unknown>} args.gateResultToSnake kernel 注入。
 * @returns {{ ok: boolean, skipped: boolean, disclosure: string | null, storePresent: boolean, problems: string[], grn: string | null, anchor: { appliedSeq: number | null } }}
 */
export function verifyGateRecordInLedger({ results, storeRoot, gateResultToSnake }) {
  const problems = [];
  const layout = storeLayout(storeRoot);
  const storePresent = existsSync(layout.pomasterDir);
  const record = results?.gate_record;
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return {
      ok: false,
      skipped: false,
      disclosure: null,
      storePresent,
      problems: ["results.gate_record 缺席或不是对象（旧版 results 或文件损坏）——重跑 node benchmarks/mutation-kill.mjs 生成新格式"],
      grn: null,
      anchor: { appliedSeq: null },
    };
  }
  const grn = typeof record.grn === "string" ? record.grn : null;
  if (grn === null || !GRN_RE.test(grn)) {
    return {
      ok: false,
      skipped: false,
      disclosure: null,
      storePresent,
      problems: [`results.gate_record.grn 词形非法（须 GRN-[0-9]+）：${String(record.grn)}`],
      grn,
      anchor: { appliedSeq: null },
    };
  }

  // —— 分层第二支：store 缺席（Owner 决议账本留本机不入 git——fresh clone 属预期形态）
  // ——账本在账对账层显式跳过（披露非静默）；判卷锚重放层已全绿兜底判卷。
  if (!storePresent) {
    return {
      ok: true,
      skipped: true,
      disclosure: ledgerSkipDisclosure(grn),
      storePresent: false,
      problems: [],
      grn,
      anchor: { appliedSeq: null },
    };
  }

  // —— run 文件在账 + 与 results.gate_record 全量一致（store 在座必查，fail-closed）——
  const runPath = layout.runFile(grn);
  if (!existsSync(runPath)) {
    problems.push(
      `GRN ${grn} 不在账（${runPath} 缺席）——store 在座而账本对账必查（fail-closed）：测量后入账未发生或 store 局部被清；重跑 node benchmarks/mutation-kill.mjs 重新测量入账`,
    );
    return { ok: false, skipped: false, disclosure: null, storePresent: true, problems, grn, anchor: { appliedSeq: null } };
  }
  let stored;
  try {
    stored = JSON.parse(readFileSync(runPath, "utf8"));
  } catch (error) {
    problems.push(`在账 run 文件无法解析（损坏或手改）：${String(error)}`);
    return { ok: false, skipped: false, disclosure: null, storePresent: true, problems, grn, anchor: { appliedSeq: null } };
  }
  const expected = expectedStoreRunRecord(record, gateResultToSnake);
  const diffs = runRecordDiff(stored, expected);
  for (const diff of diffs) {
    problems.push(`store 在账内容与 results.gate_record 不一致（手改或口径漂移）：${diff}`);
  }

  // —— journal TX_APPLIED 锚（写入经 applyTransaction 通路的证据面）——
  const events = readJournalEvents(layout.journalPath, problems);
  const gateRunEvents = events.filter(
    (event) =>
      event.type === "TX_APPLIED" &&
      Array.isArray(event.ops) &&
      /** @type {unknown[]} */ (event.ops).includes("record_gate_run"),
  );
  let anchoredSeq = null;
  if (gateRunEvents.length === 0 && problems.length === 0) {
    problems.push("journal 无 record_gate_run 的 TX_APPLIED 锚——run 文件疑似旁路直写（违反 CLAIMED：入账必经 applyTransaction）");
  }
  const declaredAppliedSeq = results?.ledger_entry?.applied_seq;
  if (typeof declaredAppliedSeq === "number" && Number.isInteger(declaredAppliedSeq)) {
    const matched = gateRunEvents.some((event) => event.seq === declaredAppliedSeq);
    if (!matched) {
      problems.push(
        `ledger_entry.applied_seq=${String(declaredAppliedSeq)} 对应的 TX_APPLIED 锚缺席（journal 被截断/手改，或 results 与 store 非同一入账轮）`,
      );
    } else {
      anchoredSeq = declaredAppliedSeq;
    }
  }
  return { ok: problems.length === 0, skipped: false, disclosure: null, storePresent: true, problems, grn, anchor: { appliedSeq: anchoredSeq } };
}
