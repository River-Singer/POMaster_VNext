/**
 * supervisor-trigger.ts —— DEF-SUP 触发制观测器（P21-Contract；D 线 §5 触发条件表
 * 逐字锚；gatekeeper.ts 同款观测纪律）。
 *
 * D 线原文（research/design-thread-D-solo-form.md §5 DEF-SUP 行）：
 *   「DEF-SUP | 常驻 supervisor daemon / `pomaster run <task>` 托管编排（§44.8） |
 *    (a) 每周 ≥3 次「同样的 SOP 链人肉重复敲」被 events 证实；(b) 第二贡献者加入；
 *    (c) 需要 headless/CI 无人值守跑 change | P1」
 *
 * 三条件对位裁定（decisions 落档 docs/wave3-p20-sec79-backfill-44-8.md P21 注记；
 * DEF-GATEKEEPER「取既有平面最近对位、不发明新面」先例同源）：
 * - (a) **measured**：SOP 链 ↔ journal（state/journal.jsonl，A4 事件平面）中
 *   「连续事件型（type）序列」的重复计数。链 = 长度 ≥ chainMinLength（缺省 2——
 *   「链」语义下限）的连续 type 元组，去噪规则：链内事件型须 ≥2 种（排除
 *   TX_APPLIED 等同型连发的日常噪声——SOP 链的本体是跨步骤异型序列）；计数窗口
 *   = 现存全量 journal（append-only 平面无墙钟，A4 分层——周窗无合法锚，取全集
 *   是宁严不漏的观测近似：超报代价远低于漏报，观测信号非阻断）；逐长度贪心
 *   不重叠计数（最左优先，确定性）；阈值缺省 3（D 线「≥3 次」逐字）；
 * - (b) **declared**：第二贡献者是人的事实，repo 状态面（sessions 的 harness 是
 *   载体不是人）无机器可判载体——如实作显式申报入参，source 词形 declared，
 *   禁自造探测（S1 同源：不把载体计数冒充人头计数）；
 * - (c) **declared**：headless/CI 需求是环境意图，同 (b) 申报入参。
 * triggered = (a) 或 (b) 或 (c) 任一成立（D 线「满足其一即立项评估」逐字）。
 *
 * 处置纪律（「观测面不施断」）：触发 = 呈报 Owner 的立项评估信号，本函数零写入
 * 零阻断（journal 与 truth-index 字节不变）；立项与否、DEF-SUP 是否升级 P1+
 * 全托管形态，处置权全在 Owner——同 DEF-GATEKEEPER「触发处置呈报 Owner」先例。
 *
 * fail-closed：journal 损坏行 SCHEMA_INVALID（readJournalLines 同源——观测面静默
 * 损坏 = 假绿）；阈值/链长非法定值 SCHEMA_INVALID（不发明缺省外语义）。
 */
import { GovernanceError } from "./errors.js";
import { pathsOf, readCurrentSeq, readJournalLines, type StorePaths } from "./paths.js";
import type { Store } from "./index.js";

/** (a) 链重复阈值缺省（D 线「每周 ≥3 次」逐字）。 */
export const SUPERVISOR_CHAIN_THRESHOLD_DEFAULT = 3 as const;

/** 链长下限缺省（「SOP 链」语义：链至少两步）。 */
export const SUPERVISOR_CHAIN_MIN_LENGTH_DEFAULT = 2 as const;

/** 链长上界缺省（观测近似上界——约束逐长度扫描的成本；超出人肉 SOP 链的现实长度）。 */
export const SUPERVISOR_MAX_CHAIN_LENGTH_DEFAULT = 8 as const;

/** 三触发条件判别词（D 线 §5 DEF-SUP 行 (a)(b)(c) 的 snake_case 机械化）。 */
export const SUPERVISOR_TRIGGER_CONDITIONS = [
  "sop_chain_repeat",
  "second_contributor",
  "headless_ci",
] as const;
export type SupervisorTriggerCondition = (typeof SUPERVISOR_TRIGGER_CONDITIONS)[number];

/** 信号来源两态：measured=机器实测（journal 面）；declared=操作者显式申报。 */
export type SupervisorTriggerSource = "measured" | "declared";

/** 命中的 SOP 链（事件型序列 + 重复计数；呈现全部达标链——证据宁可多呈现）。 */
export interface SupervisorChainMatch {
  readonly chain: readonly string[];
  readonly count: number;
}

/** 单条件观测行（source 与 triggered 并排——信号出处显式，不冒充机器实测）。 */
export interface SupervisorTriggerConditionRow {
  readonly condition: SupervisorTriggerCondition;
  readonly source: SupervisorTriggerSource;
  readonly triggered: boolean;
}

export interface SupervisorTriggerReport {
  readonly chain_threshold: number;
  readonly chain_min_length: number;
  /** 判卷采样点（store 当前 seq；未初始化 = null——观测器不强制 store 在场）。 */
  readonly judged_at_seq: number | null;
  /** 计数窗口的诚实呈现：journal 无墙钟（A4）→ 窗口=现存全量事件（宁严不漏近似）。 */
  readonly window: "full_journal";
  readonly journal_events_scanned: number;
  readonly condition_sop_chain_repeat: SupervisorTriggerConditionRow & {
    /** 达标链清单（按 count 降序 → 链长降序 → 字典序；短链包含长链语义如实并存）。 */
    readonly chains: readonly SupervisorChainMatch[];
  };
  readonly condition_second_contributor: SupervisorTriggerConditionRow;
  readonly condition_headless_ci: SupervisorTriggerConditionRow;
  /** D 线「满足其一即立项评估」：三条件取或。 */
  readonly triggered: boolean;
}

export interface SupervisorTriggerInput {
  /** (a) 链重复阈值（正整数；缺省 3 = D 线「≥3 次」逐字）。 */
  readonly chainThreshold?: number;
  /** 链长下限（正整数；缺省 2）。 */
  readonly chainMinLength?: number;
  /** 链长上界（≥ chainMinLength；缺省 8）。 */
  readonly maxChainLength?: number;
  /** (b) 第二贡献者申报（操作者显式入参；缺省 false = 未申报）。 */
  readonly secondContributor?: boolean;
  /** (c) headless/CI 需求申报（同上）。 */
  readonly headlessCi?: boolean;
}

/**
 * DEF-SUP 触发观测（纯读零写入）。journal 事件型序列中数出重复 ≥ 阈值的异型
 * 连续链 + 两个申报位并排；triggered = 三条件任一。观测信号非阻断——处置
 * （是否立项 supervisor 托管编排）呈报 Owner 裁定。
 */
export function detectSupervisorTrigger(
  store: Store,
  input: SupervisorTriggerInput = {},
): SupervisorTriggerReport {
  const paths: StorePaths = pathsOf(store);
  const chainThreshold = input.chainThreshold ?? SUPERVISOR_CHAIN_THRESHOLD_DEFAULT;
  const chainMinLength = input.chainMinLength ?? SUPERVISOR_CHAIN_MIN_LENGTH_DEFAULT;
  const maxChainLength = input.maxChainLength ?? SUPERVISOR_MAX_CHAIN_LENGTH_DEFAULT;
  if (!Number.isInteger(chainThreshold) || chainThreshold < 1) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `chainThreshold 须为正整数（D 线「≥3 次」的次数）：${String(chainThreshold)}`,
      `缺省 ${SUPERVISOR_CHAIN_THRESHOLD_DEFAULT}（D 线原文逐字）`,
      { chain_threshold: chainThreshold },
    );
  }
  if (!Number.isInteger(chainMinLength) || chainMinLength < 1) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `chainMinLength 须为正整数（「SOP 链」至少两步）：${String(chainMinLength)}`,
      `缺省 ${SUPERVISOR_CHAIN_MIN_LENGTH_DEFAULT}`,
      { chain_min_length: chainMinLength },
    );
  }
  if (!Number.isInteger(maxChainLength) || maxChainLength < chainMinLength) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `maxChainLength 须为整数且 ≥ chainMinLength：${String(maxChainLength)}`,
      `缺省 ${SUPERVISOR_MAX_CHAIN_LENGTH_DEFAULT}（观测近似上界）`,
      { max_chain_length: maxChainLength, chain_min_length: chainMinLength },
    );
  }

  // journal 损坏行由 readJournalLines 抛 SCHEMA_INVALID（fail-closed，不静默跳过）。
  const events = readJournalLines(paths);
  const types = events.map((event) =>
    typeof event.type === "string" ? event.type : "<missing_type>",
  );
  const chains = countRepeatedChains(types, chainThreshold, chainMinLength, maxChainLength);

  const conditionA: SupervisorTriggerReport["condition_sop_chain_repeat"] = {
    condition: "sop_chain_repeat",
    source: "measured",
    triggered: chains.length > 0,
    chains,
  };
  const conditionB: SupervisorTriggerReport["condition_second_contributor"] = {
    condition: "second_contributor",
    source: "declared",
    triggered: input.secondContributor === true,
  };
  const conditionC: SupervisorTriggerReport["condition_headless_ci"] = {
    condition: "headless_ci",
    source: "declared",
    triggered: input.headlessCi === true,
  };

  return {
    chain_threshold: chainThreshold,
    chain_min_length: chainMinLength,
    judged_at_seq: readCurrentSeq(paths),
    window: "full_journal",
    journal_events_scanned: events.length,
    condition_sop_chain_repeat: conditionA,
    condition_second_contributor: conditionB,
    condition_headless_ci: conditionC,
    triggered: conditionA.triggered || conditionB.triggered || conditionC.triggered,
  };
}

/** 链键分隔符（事件型为 SCREAMING_SNAKE 不含控制字符；分隔符防 ["A","BC"]/["AB","C"] 碰撞）。 */
const CHAIN_KEY_SEPARATOR = String.fromCharCode(1);

/**
 * 重复链计数（纯函数）：对每个链长 L ∈ [minLength, maxLength] 独立做最左优先
 * 贪心不重叠滑窗计数；链内事件型 ≥2 种（去同型连发噪声）；达标（count ≥
 * threshold）链按 count 降序 → 链长降序 → 字典序排序（确定性）。
 */
function countRepeatedChains(
  types: readonly string[],
  threshold: number,
  minLength: number,
  maxLength: number,
): SupervisorChainMatch[] {
  const counts = new Map<string, { chain: string[]; count: number }>();
  for (let length = minLength; length <= maxLength; length += 1) {
    let index = 0;
    while (index + length <= types.length) {
      const chain = types.slice(index, index + length);
      // 去噪：链内事件型须 ≥2 种（TX_APPLIED×N 等同型连发不是 SOP 链）。
      if (new Set(chain).size >= 2) {
        const key = chain.join(CHAIN_KEY_SEPARATOR);
        const existing = counts.get(key);
        if (existing === undefined) {
          counts.set(key, { chain, count: 1 });
        } else {
          existing.count += 1;
        }
      }
      index += length; // 贪心不重叠（最左优先；确定性计数）
    }
  }
  return [...counts.values()]
    .filter((entry) => entry.count >= threshold)
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.chain.length - a.chain.length ||
        (a.chain.join(CHAIN_KEY_SEPARATOR) < b.chain.join(CHAIN_KEY_SEPARATOR) ? -1 : 1),
    )
    .map((entry) => ({ chain: entry.chain, count: entry.count }));
}


