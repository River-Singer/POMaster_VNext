/**
 * qa-cases.ts —— `pomaster qa cases draft / freeze / check`：QA 用例集（TC-1a；
 * 11-11-agent-autopilot D-7 / code-spec qa-cases.md）。
 *
 * 通路（kickoff / plan-scenarios 同款纪律）：
 *   draft  = 生效确认单 + plan 已提交轮次 + intake 修订快照 → 原文复核三查（files
 *            sha256 重读比对 / blocks 覆盖判读 / items origin 回溯）→ 12 类分母推导
 *            （tagsOf/nfrHints 既有词表，零新词族；scenarios.json 审批链推导边 +
 *            carried 条目）→ cases.json 草案（指纹锚：sheet 字节 + revision +
 *            resolutions_sha + plan 指纹 + 用例分母）。
 *   freeze = 指纹重算一致 + 复核重算清零 + 分母完备 + 未冻结过 → cases-frozen.json
 *            （write-once）+ current.json 指针（唯一生效凭证，kickoff current.json
 *            同款地位；isolation 如实标 not_isolated——AP-0b 接独立会话）。
 *   check  = 纯读对账：指针缺席 / 冻结集字节 ≠ 指针 digest → fail（exit 1——流水线
 *            门禁语义，AC-08 同款 fail-closed）；草案漂移 / intake 超前 / 确认单字节
 *            漂移 → warning（信息级，不抬 exit）。
 *
 * 红线（本文件全部代码的先验约束）：
 * - **D-2 留存隔离边界**：intake / truth / plan 面纯读，唯一写口 = `.pomaster/qa/`
 *   平面（draft 不重跑 intake read，发现漏检回 intake 流程收口——QA_CASES_REVIEW_OPEN
 *   门禁把 QA 推回去，不代 intake 修）。
 * - **词表纪律（禁私扩词表）**：12 类推导只消费 intake-draft 的 RULE_TAGS / NFR_TOPICS
 *   既有判定（tagsOf / nfrHints import 复用）+ 类别命名的中文词面（必填/唯一/超时·
 *   重试/回滚）——词面来自 D-7 类别名本身，不是新词族。
 * - **重生成不能豁免（D-7）**：冻结集的权威锚是 current.json 里的 digest，不是哪个
 *   会话写的——换 QA 身份、重生成 cases-frozen.json 都过不了 `qa cases check`。
 * - **N/A 不覆盖生效义务**：某类 count=0 且无 na 依据 → freeze 拒绝（分母逐类校验
 *   从 cases 数组重算，手改 categories 报表绕不过）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { CliError, CliWarning } from "./envelope.js";
import { failOutcome, okOutcome, type CommandOutcome } from "./envelope.js";
import { nfrHints, tagsOf, type NfrHint } from "./intake-draft.js";
import { loadIntakeLatest, type StoredBlock } from "./intake.js";
import type { IntakeItem } from "./intake-identity.js";
import { KICKOFF_CURRENT_SCHEMA, KICKOFF_DIR, type KickoffSheet } from "./kickoff.js";

/** qa 平面根（cli 本地平面，kernel 空根零改动——kickoff/plan 同款先例）。 */
export const QA_DIR = ".pomaster/qa";
/** 用例集 schema（cases.json 与 cases-frozen.json 共用）。 */
export const QA_CASES_SCHEMA = "pomaster.qa-cases/v1";
/** 唯一生效凭证 schema（current.json）。 */
export const QA_CURRENT_SCHEMA = "pomaster.qa-current/v1";

/** 12 类分母固定词形（D-7 中文原文 → 机器键；顺序即用例编号顺序）。 */
export const QA_CATEGORIES = [
  "normal",
  "boundary",
  "invalid_input",
  "missing",
  "duplicate",
  "permission",
  "state_transition",
  "business_exception",
  "timeout_retry",
  "concurrency",
  "rollback",
  "regression",
] as const;
export type QaCategory = (typeof QA_CATEGORIES)[number];

export const QA_CATEGORY_ZH: Readonly<Record<QaCategory, string>> = {
  normal: "正常",
  boundary: "边界",
  invalid_input: "非法输入",
  missing: "缺失",
  duplicate: "重复",
  permission: "权限",
  state_transition: "状态转换",
  business_exception: "业务异常",
  timeout_retry: "超时重试",
  concurrency: "并发",
  rollback: "回滚",
  regression: "回归",
};

/** 词面拆分（D-7 类别命名的中文词本身；不是新词族——RULE_TAGS 之外的类别落地靠这三组）。 */
const MISSING_WORD = /必填/;
const UNIQUE_WORD = /唯一/;
const TIMEOUT_RETRY_WORD = /超时|重试/;
const ROLLBACK_WORD = /回滚/;
const DIGIT_FACE = /\d/;

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

// ─────────────────────────────── 分母推导（纯函数） ───────────────────────────────

/** 推导输入的一条规则行（items.json kind==="rule" 的投影；origin 供用例出处）。 */
export interface QaRuleSource {
  readonly id: string;
  readonly text: string;
  readonly file: string;
  readonly locator: string;
}

/** scenarios.json 的模块投影（plan-scenarios.ts 产物的只读视图）。 */
export interface QaScenarioModule {
  readonly key: string;
  readonly name: string;
  readonly scenarios: readonly { readonly id: string; readonly text: string }[];
  readonly derived_edges: readonly { readonly kind: string; readonly from_rule: string; readonly note: string }[];
}

export interface QaDerivationInput {
  readonly rules: readonly QaRuleSource[];
  readonly nfr: readonly NfrHint[];
  readonly modules: readonly QaScenarioModule[];
  /** 上一版沿用、本次仍生效的条目（item.carried === true）。 */
  readonly carried: readonly QaRuleSource[];
}

export interface QaCase {
  readonly id: string;
  readonly category: QaCategory;
  readonly title_zh: string;
  readonly scenario_zh: string;
  readonly expected_zh: string;
  readonly source_refs: readonly string[];
  readonly origin: { readonly file: string; readonly locator: string };
  readonly derivation: string;
}

export interface QaCategoryReport {
  readonly count: number;
  readonly na: Readonly<{ basis_zh: string }> | null;
}

const ruleCase = (category: QaCategory, title: string, scenario: string, expected: string, rule: QaRuleSource, derivation: string): QaCase => ({
  id: "",
  category,
  title_zh: title,
  scenario_zh: scenario,
  expected_zh: expected,
  source_refs: [rule.id],
  origin: { file: rule.file, locator: rule.locator },
  derivation,
});

const nfrCase = (category: QaCategory, hint: NfrHint, title: string, scenario: string, expected: string): QaCase => {
  const [file, locator] = hint.origin.split(" · ");
  return {
    id: "",
    category,
    title_zh: title,
    scenario_zh: scenario,
    expected_zh: expected,
    source_refs: [hint.id],
    origin: { file: file ?? "", locator: locator ?? "" },
    derivation: `nfr_hint:${hint.topic}`,
  };
};

/**
 * 12 类分母推导（机械、可对账）：同一规则可入多类（一条义务的多个测试角度——
 * 一条「金额必填且唯一」出 missing + duplicate 两用例）；每类推导源为空 → na 依据
 * 写明哪个源为空；源非空必有 ≥1 用例（N/A 不覆盖生效义务）。
 */
export function deriveCases(input: QaDerivationInput): { readonly cases: readonly QaCase[]; readonly categories: Readonly<Record<QaCategory, QaCategoryReport>> } {
  const buckets = new Map<QaCategory, QaCase[]>(QA_CATEGORIES.map((category) => [category, [] as QaCase[]]));

  // normal：scenarios.json 每模块一条主流程（plan 轮次的模块面）
  for (const module of input.modules) {
    const refs = module.scenarios.map((scenario) => scenario.id);
    buckets.get("normal")?.push({
      id: "",
      category: "normal",
      title_zh: `${module.name}：主流程走通`,
      scenario_zh: refs.length > 0 ? `按「${module.name}」的场景走通主流程（${module.scenarios.map((scenario) => scenario.text).join("；")}）` : `按「${module.name}」的正常业务路径走通主流程`,
      expected_zh: "主流程各步骤成功，数据与状态符合需求描述",
      source_refs: refs.length > 0 ? refs : [`scenario-module:${module.key}`],
      origin: { file: "plan/<round>/scenarios.json", locator: `modules[key=${module.key}]` },
      derivation: "module_main_flow",
    });
  }

  // 规则行逐条推导（tagsOf 既有词表；词面拆分按 D-7 类别；missing/duplicate/boundary
  // 优先认领，其余 validation 归非法输入——同一义务不重复铺三类）
  for (const rule of input.rules) {
    const tags = tagsOf(rule.text);
    if (tags.includes("validation")) {
      if (MISSING_WORD.test(rule.text)) {
        buckets.get("missing")?.push(ruleCase("missing", "必填校验：缺失输入被拒绝", `${rule.text}——提交时留空该字段`, "提交被拒绝并提示必填", rule, "rule_missing"));
      } else if (UNIQUE_WORD.test(rule.text)) {
        buckets.get("duplicate")?.push(ruleCase("duplicate", "唯一性校验：重复输入被拒绝", `${rule.text}——以已存在的值重复提交`, "提交被拒绝并提示重复", rule, "rule_duplicate"));
      } else if (DIGIT_FACE.test(rule.text)) {
        buckets.get("boundary")?.push(ruleCase("boundary", "边界值：数值/长度约束面", `${rule.text}——取边界值（最小/最大/临界）各提交一次`, "边界值按规则接受或拒绝，行为与规则一致", rule, "rule_boundary"));
      } else {
        buckets.get("invalid_input")?.push(ruleCase("invalid_input", "非法输入：违反校验规则", `${rule.text}——提交不满足规则的输入`, "提交被拒绝并给出校验提示", rule, "rule_validation"));
      }
    }
    if (tags.includes("permission")) {
      buckets.get("permission")?.push(ruleCase("permission", "权限：越权操作被拒绝", `${rule.text}——以无权限身份执行对应操作`, "操作被拒绝，数据不变", rule, "rule_permission"));
    }
    if (tags.includes("state")) {
      buckets.get("state_transition")?.push(ruleCase("state_transition", "状态转换：按规则流转", `${rule.text}——执行对应状态变更`, "状态按规则流转，非法流转被拒绝", rule, "rule_state"));
    }
    if (tags.includes("exception")) {
      if (TIMEOUT_RETRY_WORD.test(rule.text)) {
        buckets.get("timeout_retry")?.push(ruleCase("timeout_retry", "超时/重试：按规则处理", `${rule.text}——模拟超时或失败后重试`, "按规则重试或明确失败，不悬挂、不重复入账", rule, "rule_timeout_retry"));
      } else if (ROLLBACK_WORD.test(rule.text)) {
        buckets.get("rollback")?.push(ruleCase("rollback", "回滚：失败后数据一致", `${rule.text}——触发回滚场景`, "相关数据回滚到操作前状态，无半成品残留", rule, "rule_rollback"));
      } else {
        buckets.get("business_exception")?.push(ruleCase("business_exception", "业务异常：按规则拒绝并提示", `${rule.text}——构造触发异常的业务输入`, "按规则拒绝并给出业务提示，系统不崩溃", rule, "rule_exception"));
      }
    }
  }

  // 状态转换补面：scenarios.json 审批链推导边（每边一条：通过/驳回两预期）
  for (const module of input.modules) {
    for (const edge of module.derived_edges) {
      buckets.get("state_transition")?.push({
        id: "",
        category: "state_transition",
        title_zh: `${module.name}：审批链流转`,
        scenario_zh: `${edge.note}——分别走「通过」与「驳回」两条路径`,
        expected_zh: "通过路径状态前进；驳回路径状态回到提交前并记录驳回原因",
        source_refs: [edge.from_rule],
        origin: { file: "plan/<round>/scenarios.json", locator: `modules[key=${module.key}].derived_edges[from_rule=${edge.from_rule}]` },
        derivation: "approval_chain_edge",
      });
    }
  }

  // NFR 面：超时重试 / 并发（nfrHints 既有判定）
  for (const hint of input.nfr) {
    if (hint.topic === "response_time") {
      buckets.get("timeout_retry")?.push(nfrCase("timeout_retry", hint, "超时：响应时限被遵守", `${hint.text}——以时限阈值压测或模拟慢响应`, `响应时间满足 ${hint.values.join(" / ") || "既定时限"}（超时有明确失败）`));
    }
    if (hint.topic === "concurrency") {
      buckets.get("concurrency")?.push(nfrCase("concurrency", hint, "并发：额度内行为正确", `${hint.text}——以 ${hint.values.join(" / ") || "既定指标"} 的并发面执行同一业务`, "并发结果与串行一致：无丢更新、无重复入账"));
    }
  }

  // 回归：上一版沿用、本次仍生效的条目（carried）
  for (const item of input.carried) {
    buckets.get("regression")?.push(ruleCase("regression", "回归：上一版沿用义务仍生效", `${item.text}——按上一版已验证的路径重放`, "行为与上一版一致（沿用义务未回退）", item, "carried_item"));
  }

  // 编号（CASE-#### 连号；顺序 = QA_CATEGORIES 词形顺序 + 推导顺序 → 指纹稳定）
  const cases: QaCase[] = [];
  let seq = 0;
  for (const category of QA_CATEGORIES) {
    for (const partial of buckets.get(category) ?? []) {
      seq += 1;
      cases.push({ ...partial, id: `CASE-${String(seq).padStart(4, "0")}` });
    }
  }

  const categories = Object.fromEntries(
    QA_CATEGORIES.map((category) => {
      const count = cases.filter((entry) => entry.category === category).length;
      return [category, { count, na: count === 0 ? { basis_zh: naBasisOf(category) } : null }];
    }),
  ) as Readonly<Record<QaCategory, QaCategoryReport>>;
  return { cases, categories };
}

/** 某类推导源为空时的 N/A 依据词形（写明哪个源为空——「有依据不适用」）。 */
function naBasisOf(category: QaCategory): string {
  switch (category) {
    case "normal":
      return "推导源为空：scenarios.json 无业务模块（plan 轮次模块面为空）";
    case "boundary":
      return "推导源为空：规则条目无带数值面的 validation 词面";
    case "invalid_input":
      return "推导源为空：规则条目无 validation 词面（禁填/格式/校验族）";
    case "missing":
      return "推导源为空：规则条目无「必填」词面";
    case "duplicate":
      return "推导源为空：规则条目无「唯一」词面";
    case "permission":
      return "推导源为空：规则条目无 permission 词面";
    case "state_transition":
      return "推导源为空：规则条目无 state 词面且 scenarios.json 无审批链推导边";
    case "business_exception":
      return "推导源为空：规则条目无 exception 词面（超时/重试/回滚已分流到专属类）";
    case "timeout_retry":
      return "推导源为空：规则条目与 NFR 面均无「超时/重试」词面";
    case "concurrency":
      return "推导源为空：NFR 面无 concurrency 条目";
    case "rollback":
      return "推导源为空：规则条目无「回滚」词面";
    case "regression":
      return "推导源为空：本修订无 carried（上一版沿用）条目——首轮或全新义务";
  }
}

// ─────────────────────────────── 原文复核（三查，纯读） ───────────────────────────────

export interface SourceReview {
  readonly files: { readonly checked: number; readonly matched: number; readonly drift: readonly { readonly path: string; readonly recorded: string; readonly actual: string }[] };
  readonly blocks: { readonly total: number; readonly covered: number; readonly documented_skips: number; readonly uncovered: readonly { readonly id: string; readonly file: string; readonly heading_path: readonly string[]; readonly excerpt: string }[] };
  readonly items: { readonly total: number; readonly origin_resolved: number; readonly broken: readonly { readonly id: string; readonly block: string }[] };
}

export interface QaFileRecord {
  readonly root: number;
  readonly path: string;
  readonly sha256: string;
  readonly class: string;
}
export interface QaFilesSnapshot {
  readonly revision: number;
  readonly resolutions_sha256: string;
  /** 扫描时的输入根（绝对路径；files[root] 的 path 相对它）。 */
  readonly inputs: readonly string[];
  readonly files: readonly QaFileRecord[];
}
export interface QaBlockResolution {
  readonly as: "item" | "gap" | "presentation" | "skip";
}
export interface QaResolutions {
  readonly blocks: Readonly<Record<string, QaBlockResolution>>;
}

/**
 * 原文复核三查（C-08 防线；D-2 纯读——重读磁盘只比对，零写口）：
 * 1) files：逐文件按 inputs[root]+path 重读、sha256 与 files.json 记录比对（材料在
 *    读取后变过 → drift）；
 * 2) blocks：items 非空 / resolution(item·gap) = covered，resolution(presentation·skip)
 *    = documented_skips，其余 = uncovered（提取可能漏检候选——freeze 门禁清零）；
 * 3) items：origin.block 非空者必须在 blocks.json 在座（断链 = 提取/对齐损坏）。
 *    只查当前修订的条目——carried（上一版沿用）条目的出处块住在旧修订快照里，
 *    对照当前 blocks.json 断链是历史常态不是损坏。
 */
export function reviewSources(inputs: readonly string[], files: readonly QaFileRecord[], blocks: readonly StoredBlock[], items: readonly IntakeItem[], resolutions: QaResolutions, revision: number): SourceReview {
  const drift: { path: string; recorded: string; actual: string }[] = [];
  let matched = 0;
  for (const record of files) {
    const base = inputs[record.root];
    const absolute = base === undefined ? record.path : join(base, record.path);
    if (!existsSync(absolute)) {
      drift.push({ path: record.path, recorded: record.sha256.slice(0, 12), actual: "（文件缺席）" });
      continue;
    }
    const actual = sha256(readFileSync(absolute));
    if (actual === record.sha256) matched += 1;
    else drift.push({ path: record.path, recorded: record.sha256.slice(0, 12), actual: actual.slice(0, 12) });
  }

  const uncovered: { id: string; file: string; heading_path: readonly string[]; excerpt: string }[] = [];
  let covered = 0;
  let documentedSkips = 0;
  for (const block of blocks) {
    const resolution = resolutions.blocks[block.id];
    const destination = block.destination;
    // covered：出条目（items:*）/ 读后 resolve 成条目或缺口 / 读时判读为缺口
    if ((block.items !== undefined && block.items.length > 0) || resolution?.as === "item" || resolution?.as === "gap" || destination === "gap") covered += 1;
    // documented_skips：读时判读已定（结构块 / 呈现面 / 跳过）或读后 resolve 成跳过
    else if (resolution?.as === "presentation" || resolution?.as === "skip" || destination === "structure" || destination === "presentation" || destination === "skip") documentedSkips += 1;
    // 其余 = pending 且没有任何收口记录 → 提取可能漏检候选（freeze 门禁清零）
    else uncovered.push({ id: block.id, file: block.file, heading_path: block.heading_path, excerpt: block.excerpt.slice(0, 80) });
  }

  const blockIds = new Set(blocks.map((block) => block.id));
  const broken: { id: string; block: string }[] = [];
  let originResolved = 0;
  for (const item of items) {
    if (item.origin.block === null || item.origin.revision !== revision) continue;
    if (blockIds.has(item.origin.block)) originResolved += 1;
    else broken.push({ id: item.id, block: item.origin.block });
  }

  return {
    files: { checked: files.length, matched, drift },
    blocks: { total: blocks.length, covered, documented_skips: documentedSkips, uncovered },
    items: { total: items.length, origin_resolved: originResolved, broken },
  };
}

// ─────────────────────────────── 指纹 ───────────────────────────────

/** cases.json 指纹：确认单字节 + revision + resolutions_sha + plan 指纹 + 用例分母规范化序列。 */
export function casesFingerprint(parts: { readonly sheet_bytes: Buffer; readonly revision: number; readonly resolutions_sha256: string; readonly plan_fingerprint: string; readonly cases: readonly QaCase[] }): string {
  const denominator = sha256(JSON.stringify(parts.cases));
  return sha256(`${parts.sheet_bytes.toString("utf8")}\n${parts.revision}\n${parts.resolutions_sha256}\n${parts.plan_fingerprint}\n${denominator}`);
}

// ─────────────────────────────── 载入与前置（draft 共享链） ───────────────────────────────

interface KickoffCurrent {
  readonly schema: string;
  readonly sheet: string;
  readonly sheet_sha256: string;
  readonly valid_until: string;
}
interface PlanFile {
  readonly schema: string;
  readonly fingerprint: string;
  readonly committed?: boolean;
}
interface ScenarioModulesFile {
  readonly modules: readonly QaScenarioModule[];
}

export interface QaCommandResult {
  readonly round: string;
  readonly change: "CREATED" | "FROZEN" | "OK";
  readonly categories?: Readonly<Record<string, QaCategoryReport>>;
  readonly case_count?: number;
  readonly review?: SourceReview;
  readonly frozen_sha256?: string;
  readonly isolation?: string;
}

interface LoadedInputs {
  readonly sheetId: string;
  readonly sheetBytes: Buffer;
  readonly sheet: KickoffSheet;
  readonly revision: number;
  readonly resolutionsSha: string;
  readonly files: QaFilesSnapshot;
  readonly blocks: readonly StoredBlock[];
  readonly items: readonly IntakeItem[];
  readonly resolutions: QaResolutions;
  readonly planFingerprint: string;
}

const fail = (command: string, errors: readonly CliError[]): CommandOutcome<QaCommandResult | null> =>
  failOutcome<QaCommandResult | null>(command, null, errors, errors.map((error) => `${command}: FAILED — ${error.code}：${error.message}${error.hint !== "" ? `\n  hint: ${error.hint}` : ""}`));

/**
 * draft 前置链（fail-closed 序）：确认单 in force（字节一致）→ intake 修订可装载且与
 * 确认单 revision 一致（QA_CASES_REVISION_AHEAD 与 PLAN_REVISION_AHEAD 同纪律：确认单
 * 之后的材料变化走增量重签，不静默消费）→ plan 轮次已提交（用例挂 plan，禁两张皮）。
 */
function loadQaInputs(dir: string, command: string): LoadedInputs | CommandOutcome<QaCommandResult | null> {
  const current = readJson<KickoffCurrent>(join(dir, ...KICKOFF_DIR.split("/"), "current.json"));
  if (current === null || current.schema !== KICKOFF_CURRENT_SCHEMA) {
    return fail(command, [{ code: "QA_KICKOFF_NOT_IN_FORCE", message: "还没有生效的启动确认单（缺 current.json）", hint: "先走 pomaster kickoff draft → 签名 → kickoff confirm" }]);
  }
  if (Number.isNaN(Date.parse(current.valid_until)) || Date.parse(current.valid_until) < Date.now()) {
    return fail(command, [{ code: "QA_KICKOFF_NOT_IN_FORCE", message: `生效中的启动确认单 ${current.sheet} 已过有效期（${current.valid_until}）`, hint: "改材料或 choices 后重新 draft → 签名 → confirm（增量重签同一机制）" }]);
  }
  const sheetPath = join(dir, ...KICKOFF_DIR.split("/"), current.sheet, "sheet.json");
  if (!existsSync(sheetPath) || sha256(readFileSync(sheetPath)) !== current.sheet_sha256) {
    return fail(command, [{ code: "QA_KICKOFF_NOT_IN_FORCE", message: `确认单 ${current.sheet} 的字节与签名时不一致（材料或 choices 在确认后又变了）`, hint: "pomaster kickoff draft → 重新签名 → kickoff confirm；已生效轮次按增量重签处理" }]);
  }
  const sheet = readJson<KickoffSheet>(sheetPath);
  if (sheet === null) {
    return fail(command, [{ code: "QA_KICKOFF_NOT_IN_FORCE", message: `确认单 ${current.sheet} 读不了（sheet.json 损坏）`, hint: "pomaster kickoff draft 重新生成并重签" }]);
  }

  const loaded = loadIntakeLatest(dir, sheet.workspace);
  if (!loaded.ok) {
    return fail(command, [{ code: "QA_CASES_NO_INTAKE", message: `需求读取工作区 ${sheet.workspace} 不在了`, hint: "确认单依赖的读取工作区被删：恢复材料后重新读取与确认（增量重签）" }]);
  }
  if (loaded.data.files.revision !== sheet.revision) {
    return fail(command, [{ code: "QA_CASES_REVISION_AHEAD", message: `读取工作区在确认单之后又变过（确认单 r${sheet.revision}，当前 r${loaded.data.files.revision}）`, hint: "材料有新修订：走增量重签（kickoff draft → 签名 → confirm）后再出用例" }]);
  }

  const planPath = join(dir, ".pomaster", "plan", current.sheet, "plan.json");
  const plan = readJson<PlanFile>(planPath);
  if (plan === null || plan.committed !== true) {
    return fail(command, [{ code: "QA_CASES_PLAN_MISSING", message: `轮次 ${current.sheet} 还没有已提交的场景规划（plan.json 缺席或未提交）`, hint: "先跑 pomaster plan scenarios（用例挂 plan 轮次，禁两张皮）" }]);
  }

  return {
    sheetId: current.sheet,
    sheetBytes: readFileSync(sheetPath),
    sheet,
    revision: loaded.data.files.revision,
    resolutionsSha: loaded.data.files.resolutions_sha256,
    files: loaded.data.files,
    blocks: loaded.data.blocks,
    items: loaded.data.items,
    resolutions: loaded.workspace.resolutions,
    planFingerprint: plan.fingerprint,
  };
}

// ─────────────────────────────── qa cases draft ───────────────────────────────

export function runQaCasesDraft(dir: string, _input: { readonly name?: string } = {}): CommandOutcome<QaCommandResult | null> {
  const command = "qa cases draft";
  const loaded = loadQaInputs(dir, command);
  if (!("sheetId" in loaded)) return loaded;

  // 原文复核三查：drift / 断链 fail-closed；uncovered 入报告（freeze 门禁清零）
  const review = reviewSources(loaded.files.inputs, loaded.files.files, loaded.blocks, loaded.items, loaded.resolutions, loaded.revision);
  const failures: CliError[] = [];
  if (review.files.drift.length > 0) {
    failures.push({
      code: "QA_CASES_SOURCE_DRIFT",
      message: `原始材料与读取时不一致（${review.files.drift.length} 个文件漂移，如 ${review.files.drift[0]?.path} ${review.files.drift[0]?.recorded} → ${review.files.drift[0]?.actual}）`,
      hint: "材料在 intake read 之后变过：重跑 pomaster intake read → draft → 增量重签，再出用例",
    });
  }
  if (review.items.broken.length > 0) {
    failures.push({
      code: "QA_CASES_ORIGIN_BROKEN",
      message: `${review.items.broken.length} 个条目的出处块在 blocks.json 断链（如 ${review.items.broken[0]?.id} → ${review.items.broken[0]?.block}）`,
      hint: "提取/对齐产物损坏：重跑 pomaster intake read 重建修订快照",
    });
  }
  if (failures.length > 0) return fail(command, failures);

  // 分母推导源（items.json rule 条目 + scenarios.json 模块面 + carried + NFR）
  const rules = loaded.items.filter((item) => item.kind === "rule").map((item) => ({ id: item.id, text: item.text, file: item.origin.file, locator: item.origin.locator }));
  const carried = loaded.items.filter((item) => item.carried === true).map((item) => ({ id: item.id, text: item.text, file: item.origin.file, locator: item.origin.locator }));
  const scenarioPath = join(dir, ".pomaster", "plan", loaded.sheetId, "scenarios.json");
  const scenarioModules = readJson<ScenarioModulesFile>(scenarioPath)?.modules ?? [];

  const { cases, categories } = deriveCases({ rules, nfr: nfrHints(loaded.items), modules: scenarioModules, carried });
  const fingerprint = casesFingerprint({ sheet_bytes: loaded.sheetBytes, revision: loaded.revision, resolutions_sha256: loaded.resolutionsSha, plan_fingerprint: loaded.planFingerprint, cases });
  const casesData = {
    schema: QA_CASES_SCHEMA,
    round: loaded.sheetId,
    sheet: loaded.sheetId,
    sheet_sha256: sha256(loaded.sheetBytes),
    revision: loaded.revision,
    resolutions_sha256: loaded.resolutionsSha,
    plan_fingerprint: loaded.planFingerprint,
    created_at: new Date().toISOString(),
    fingerprint,
    review,
    categories,
    cases,
  };

  const roundDir = join(dir, ...QA_DIR.split("/"), loaded.sheetId);
  mkdirSync(roundDir, { recursive: true });
  writeFileSync(join(roundDir, "cases.json"), `${JSON.stringify(casesData, null, 2)}\n`, "utf8");

  const human = [
    `qa cases draft: CREATED — ${loaded.sheetId}（r${loaded.revision}）`,
    `  原文复核：files ${review.files.matched}/${review.files.checked} 一致；blocks ${review.blocks.covered}/${review.blocks.total} 已消费（${review.blocks.documented_skips} 有据跳过）；items ${review.items.origin_resolved}/${review.items.total} 出处回溯`,
  ];
  if (review.blocks.uncovered.length > 0) {
    human.push(`  ⚠ 未消费块 ${review.blocks.uncovered.length} 个（提取可能漏检候选——freeze 前要回 intake resolve 收口）：`);
    for (const block of review.blocks.uncovered.slice(0, 10)) human.push(`    ${block.id} · ${block.file} · ${block.heading_path.join(" > ")} · ${block.excerpt}`);
  }
  human.push(`  分母（12 类）：${QA_CATEGORIES.map((category) => `${QA_CATEGORY_ZH[category]} ${categories[category].count}`).join(" · ")}`);
  human.push(`  用例 ${cases.length} 条（CASE-0001…，全部带出处 source_refs）；指纹 ${fingerprint.slice(0, 12)}…`);
  return okOutcome(command, { round: loaded.sheetId, change: "CREATED", categories, case_count: cases.length, review }, human);
}

// ─────────────────────────────── qa cases freeze ───────────────────────────────

interface CasesFile {
  readonly schema: string;
  readonly round: string;
  readonly sheet: string;
  readonly revision: number;
  readonly resolutions_sha256: string;
  readonly plan_fingerprint: string;
  readonly fingerprint: string;
  readonly review: SourceReview;
  readonly categories: Readonly<Record<string, QaCategoryReport>>;
  readonly cases: readonly QaCase[];
}

export function runQaCasesFreeze(dir: string, _input: {} = {}): CommandOutcome<QaCommandResult | null> {
  const command = "qa cases freeze";
  const round = readJson<KickoffCurrent>(join(dir, ...KICKOFF_DIR.split("/"), "current.json"))?.sheet;
  if (round === undefined || round === "") {
    return fail(command, [{ code: "QA_KICKOFF_NOT_IN_FORCE", message: "还没有生效的启动确认单（缺 current.json）", hint: "先走 pomaster kickoff draft → 签名 → kickoff confirm" }]);
  }
  const casesPath = join(dir, ...QA_DIR.split("/"), round, "cases.json");
  const draft = readJson<CasesFile>(casesPath);
  if (draft === null || draft.schema !== QA_CASES_SCHEMA) {
    return fail(command, [{ code: "QA_CASES_DRAFT_MISSING", message: `轮次 ${round} 还没有用例草案（cases.json 缺席）`, hint: "先跑 pomaster qa cases draft" }]);
  }

  // 指纹重算（draft 后材料/规格/plan 又变过 → 拒绝；fingerprint 锚输入面）
  const loaded = loadQaInputs(dir, command);
  if (!("sheetId" in loaded)) return loaded;
  if (loaded.sheetId !== round) {
    return fail(command, [{ code: "QA_CASES_INPUTS_DRIFTED", message: `草案属于轮次 ${round}，当前生效确认单是 ${loaded.sheetId}`, hint: "生效轮次已换：新轮次重跑 qa cases draft" }]);
  }
  const fingerprint = casesFingerprint({ sheet_bytes: loaded.sheetBytes, revision: loaded.revision, resolutions_sha256: loaded.resolutionsSha, plan_fingerprint: loaded.planFingerprint, cases: draft.cases });
  if (fingerprint !== draft.fingerprint) {
    return fail(command, [{ code: "QA_CASES_INPUTS_DRIFTED", message: `草案指纹与当前输入不一致（草案 ${draft.fingerprint.slice(0, 12)}… ≠ 重算 ${fingerprint.slice(0, 12)}…）`, hint: "draft 之后材料/规格/plan 变过：重跑 pomaster qa cases draft 再冻结" }]);
  }

  // 复核重算（手改草案报表绕不过）：uncovered 必须清零；drift/断链 fail-closed
  const review = reviewSources(loaded.files.inputs, loaded.files.files, loaded.blocks, loaded.items, loaded.resolutions, loaded.revision);
  if (review.files.drift.length > 0 || review.items.broken.length > 0) {
    return fail(command, [{ code: "QA_CASES_SOURCE_DRIFT", message: "冻结前复核发现材料漂移或出处断链（重跑 draft 看明细）", hint: "材料在 draft 之后又变过：intake read → 增量重签 → 重新 draft" }]);
  }
  if (review.blocks.uncovered.length > 0) {
    return fail(command, [{
      code: "QA_CASES_REVIEW_OPEN",
      message: `原文复核未收口：${review.blocks.uncovered.length} 个块没有被任何条目消费也没有 resolve 记录（如 ${review.blocks.uncovered[0]?.id} · ${review.blocks.uncovered[0]?.heading_path.join(" > ")}）`,
      hint: "提取可能漏检（C-08）：回 pomaster intake resolve 逐块收口（收为条目/缺口/跳过），再 draft → freeze",
    }]);
  }

  // 分母逐类校验（从 cases 数组重算，手改 categories 报表绕不过）
  const incomplete: string[] = [];
  for (const category of QA_CATEGORIES) {
    const actual = draft.cases.filter((entry) => entry.category === category).length;
    const reported = draft.categories[category];
    if (reported === undefined) {
      incomplete.push(`${QA_CATEGORY_ZH[category]}（categories 缺行）`);
      continue;
    }
    if (reported.count !== actual) {
      incomplete.push(`${QA_CATEGORY_ZH[category]}（报表 count=${reported.count} ≠ 实际 ${actual}）`);
      continue;
    }
    if (actual === 0 && reported.na === null) incomplete.push(`${QA_CATEGORY_ZH[category]}（0 条且无 N/A 依据——不适用要有据）`);
  }
  if (incomplete.length > 0) {
    return fail(command, [{ code: "QA_CASES_FREEZE_INCOMPLETE", message: `分母不完备：${incomplete.join("；")}`, hint: "12 类逐类要有场景或有依据不适用（D-7）；补推导源或回 intake 收口后重跑 draft" }]);
  }
  const orphan = draft.cases.filter((entry) => !QA_CATEGORIES.includes(entry.category));
  if (orphan.length > 0) {
    return fail(command, [{ code: "QA_CASES_FREEZE_INCOMPLETE", message: `${orphan.length} 条用例的 category 不在 12 类词形内（如 ${orphan[0]?.id} ${String(orphan[0]?.category)}）`, hint: "分母词形固定（code-spec qa-cases.md）；换 QA 身份改词形不能绕分母" }]);
  }
  const unanchored = draft.cases.filter((entry) => entry.source_refs.length === 0);
  if (unanchored.length > 0) {
    return fail(command, [{ code: "QA_CASES_FREEZE_INCOMPLETE", message: `${unanchored.length} 条用例没有出处（source_refs 空，如 ${unanchored[0]?.id}）`, hint: "先立后证：没有出处的用例不存在" }]);
  }

  // 冻结一次性
  const currentPath = join(dir, ...QA_DIR.split("/"), "current.json");
  if (readJson<unknown>(currentPath) !== null) {
    return fail(command, [{ code: "QA_CASES_ALREADY_FROZEN", message: "已有冻结中的用例集（qa/current.json 在座）", hint: "冻结集不可变；材料/规格变化走 qa cases revise（TC-1b）重冻结并留谱系" }]);
  }

  const frozenAt = new Date().toISOString();
  const frozenData = { ...draft, frozen_at: frozenAt, isolation: "not_isolated" };
  const frozenPath = join(dir, ...QA_DIR.split("/"), round, "cases-frozen.json");
  mkdirSync(join(dir, ...QA_DIR.split("/"), round), { recursive: true });
  const frozenBytes = Buffer.from(`${JSON.stringify(frozenData, null, 2)}\n`, "utf8");
  writeFileSync(frozenPath, frozenBytes);
  const pointer = {
    schema: QA_CURRENT_SCHEMA,
    round,
    sheet: round,
    sheet_sha256: sha256(loaded.sheetBytes),
    cases_frozen_sha256: sha256(frozenBytes),
    frozen_at: frozenAt,
    revision: loaded.revision,
    resolutions_sha256: loaded.resolutionsSha,
    isolation: "not_isolated",
    parent: null,
  };
  writeFileSync(currentPath, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");

  const total = draft.cases.length;
  const human = [
    `qa cases freeze: FROZEN — ${round}（r${loaded.revision}）`,
    `  冻结集 ${frozenPath}（sha256 ${pointer.cases_frozen_sha256.slice(0, 12)}…）；用例 ${total} 条`,
    `  分母：${QA_CATEGORIES.map((category) => `${QA_CATEGORY_ZH[category]} ${draft.categories[category]?.count ?? 0}`).join(" · ")}`,
    "  留存隔离：not_isolated（QA 独立会话未接线——AP-0b；如实标注，不假称隔离）",
    "  冻结集对实现者只读；改动会被 qa cases check 以 digest 对账逮住（换身份/重生成不能豁免）",
  ];
  return okOutcome(command, { round, change: "FROZEN", categories: draft.categories, case_count: total, frozen_sha256: pointer.cases_frozen_sha256, isolation: pointer.isolation }, human);
}

// ─────────────────────────────── qa cases check ───────────────────────────────

interface QaCurrentPointer {
  readonly schema: string;
  readonly round: string;
  readonly sheet: string;
  readonly sheet_sha256: string;
  readonly cases_frozen_sha256: string;
  readonly revision: number;
}

/** 纯读对账：指针缺席 / digest 不一致 → fail（exit 1 门禁）；其余漂移 → warning（不抬 exit）。 */
export function runQaCasesCheck(dir: string, _input: {} = {}): CommandOutcome<QaCommandResult | null> {
  const command = "qa cases check";
  const pointer = readJson<QaCurrentPointer>(join(dir, ...QA_DIR.split("/"), "current.json"));
  if (pointer === null || pointer.schema !== QA_CURRENT_SCHEMA) {
    return fail(command, [{ code: "QA_CASES_NOT_FROZEN", message: "还没有冻结的 QA 用例集（qa/current.json 缺席）", hint: "先跑 pomaster qa cases draft → freeze；验收流水线在冻结前不放行" }]);
  }

  const frozenPath = join(dir, ...QA_DIR.split("/"), pointer.round, "cases-frozen.json");
  if (!existsSync(frozenPath) || sha256(readFileSync(frozenPath)) !== pointer.cases_frozen_sha256) {
    return fail(command, [{ code: "QA_CASES_TAMPERED", message: `冻结集与指针 digest 不一致（${pointer.round}/cases-frozen.json 被改过或缺席；指针锚 ${pointer.cases_frozen_sha256.slice(0, 12)}…）`, hint: "重生成文件、换 QA 身份不能豁免（D-7）：恢复冻结字节，或走 qa cases revise（TC-1b）重冻结留谱系" }]);
  }

  const warnings: CliWarning[] = [];
  const draft = readJson<CasesFile>(join(dir, ...QA_DIR.split("/"), pointer.round, "cases.json"));
  if (draft !== null && draft.fingerprint !== undefined) {
    const frozen = readJson<CasesFile>(frozenPath);
    if (frozen !== null && draft.fingerprint !== frozen.fingerprint) {
      warnings.push({ code: "DRAFT_DRIFT", message: `草案 cases.json 与冻结集指纹不同（草案被重跑过；冻结集不受影响）`, hint: "要对齐就重跑 draft——但重冻结要走 revise（TC-1b），冻结集不可变" });
    }
  }
  const loaded = loadIntakeLatest(dir, readJson<KickoffSheet>(join(dir, ...KICKOFF_DIR.split("/"), pointer.sheet, "sheet.json"))?.workspace);
  if (loaded.ok && loaded.data.files.revision !== pointer.revision) {
    warnings.push({ code: "REVISION_AHEAD", message: `intake 修订（r${loaded.data.files.revision}）已超前冻结集（r${pointer.revision}）`, hint: "TC-1b qa cases revise 的触发面：材料变化要重冻结并留谱系（旧用例保留、替代关系带需求差异）" });
  }
  const sheetPath = join(dir, ...KICKOFF_DIR.split("/"), pointer.sheet, "sheet.json");
  if (existsSync(sheetPath) && sha256(readFileSync(sheetPath)) !== pointer.sheet_sha256) {
    warnings.push({ code: "SHEET_DRIFT", message: `确认单 ${pointer.sheet} 字节与冻结时不一致`, hint: "确认单被改过：增量重签后按 revise 链路处理" });
  }

  const human = [
    `qa cases check: OK — ${pointer.round}（冻结集 digest 一致）`,
    `  冻结 sha256 ${pointer.cases_frozen_sha256.slice(0, 12)}…；frozen_at ${readJson<{ frozen_at: string }>(frozenPath)?.frozen_at ?? "?"}；isolation ${readJson<{ isolation: string }>(frozenPath)?.isolation ?? "?"}`,
  ];
  for (const warning of warnings) human.push(`  ⚠ ${warning.code}：${warning.message}`);
  if (warnings.length === 0) human.push("  无漂移（草案/修订/确认单均与冻结时一致）");
  return okOutcome(command, { round: pointer.round, change: "OK" }, human, warnings);
}
