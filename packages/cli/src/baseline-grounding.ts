/**
 * baseline-grounding.ts —— baseline 确认态 + design-tokens 的投影接地事实生产者
 * （R4/design-context 批：context manifest 消费 confirmed baseline/tokens）。
 *
 * 职责边界（F4/单一权威纪律的 CLI 侧延伸）：
 * - 本模块是 compileProjection `options.baselineGrounding` 的**唯一生产者**——
 *   runContextCompile（F4 单一编排权威）默认 compileProjection 依赖单点注入，
 *   显式命令 / maintain pre-dev 链 / judgeTaskContextFreshness 三通路天然继承
 *   （全部经共享入口，零第二注入点）；
 * - baseline 词形解析（confirmed 块 / 三态机 / 阻塞集 / tokens 装载）**独占复用**
 *   baseline.ts 与 baseline-tokens.ts 既有实现（readBaselineConfirmation /
 *   readBaselineBlockingPresentation / readDesignTokens——禁第二套解析器/三态机/
 *   阻塞口径）；本模块只做事实组装（digest 快照采集 + tokens 组清单派生）；
 * - 指纹机制沿 kernel 既有 inputsFingerprint 复用（facts 折算进
 *   sha256OfCanonical 输入——PRD R2「禁发明第二套哈希」），本模块零哈希计算
 *   （digest 词形 sha256:<hex> 全部来自 sha256OfUtf8 单点，与 confirm 快照同口径）；
 * - 纯读零写入（投影只读纪律）：一切读盘路径异常收敛为 facts 的诚实降级位
 *   （absent/unreadable），禁 throw 炸投影编译——呈现位异常归缺席纪律
 *   （observation_receipts 同款）。
 *
 * 指纹绑定语义（R2/R4）：facts 整体作为 inputsFingerprint 折算输入——
 * - 任一确认资产字节变化（含 design-tokens.yaml）→ current_digests 变化；
 * - 确认动作（首确认/重确认/批终结）→ state/at_seq/confirmed_digests 变化；
 * - set --change 授权写入 → state 转 pending-change（批词形变化）；
 * → compile --check 全部按既有 STALE_GROUNDING 词形呈现（stale 不阻断，R4）。
 * 消费无关的环境位（如 store seq）不入 facts——最小上下文契约（范围外变化不误伤
 * freshness）沿 scopeContentRowsOf 同一纪律。
 */

import type {
  BaselineGroundingFacts,
  BaselineTokenGroupFacts,
  BaselineTokensFacts,
} from "@pomaster/kernel";
import { sha256OfUtf8 } from "@pomaster/kernel";
import {
  BASELINE_CONFIRM_TARGETS,
  BASELINE_DESIGN_TOKENS_TARGET,
  baselineConfirmTargetPath,
  readBaselineBlockingPresentation,
  readBaselineConfirmation,
} from "./baseline.js";
import { readDesignTokens } from "./baseline-tokens.js";

/** 确认记录条目 ref 词形（confirmed 块所在文件的记录锚；投影条目呈现位单一词源）。 */
export const BASELINE_CONFIRMATION_REF = "baseline/manifest.yaml#confirmed" as const;

/** 现盘确认资产 tolerant digest 快照：缺席 = "absent"、不可读 = "unreadable"（诚实降级位，非静默空表）。 */
async function currentDigestSnapshot(
  rootDir: string,
): Promise<Readonly<Record<string, string>>> {
  const { readFile, stat } = await import("node:fs/promises");
  const digests: Record<string, string> = {};
  for (const target of BASELINE_CONFIRM_TARGETS) {
    const absolute = baselineConfirmTargetPath(rootDir, target);
    try {
      await stat(absolute);
    } catch {
      digests[target] = "absent";
      continue;
    }
    try {
      digests[target] = sha256OfUtf8(await readFile(absolute, "utf8"));
    } catch {
      digests[target] = "unreadable";
    }
  }
  return digests;
}

/**
 * design-tokens 装载三态 → facts（装载面 fail-closed 原样透传；ok 面 = 九组清单 +
 * UNKNOWN 叶键三态标注。组清单派生是本模块唯一新增派生逻辑：递归收集叶键
 * （非映射值）与 UNKNOWN 词形叶键——值不搬运（投影不复制 token 值，字节由
 * current_digests 绑定，「零值伪造」结构性成立）。
 */
async function tokensFacts(rootDir: string): Promise<BaselineTokensFacts> {
  const read = await readDesignTokens(rootDir);
  if (read.kind === "absent") return { kind: "absent" };
  if (read.kind === "invalid") {
    return { kind: "invalid", detail: read.detail.replace(/\s+/g, " ").trim() };
  }
  const groups: BaselineTokenGroupFacts[] = [];
  for (const [name, value] of Object.entries(read.doc.groups)) {
    const keys: string[] = [];
    let count = 0;
    const walk = (prefix: string, node: unknown): void => {
      if (node !== null && typeof node === "object") {
        for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
          walk(`${prefix}.${key}`, child);
        }
        return;
      }
      count += 1;
      if (node === "UNKNOWN") keys.push(prefix);
    };
    walk(name, value);
    groups.push({ name, keys: count, unknown_keys: [...keys].sort() });
  }
  groups.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return {
    kind: "ok",
    origin: read.doc.meta.origin,
    customized: read.doc.meta.customized,
    groups,
  };
}

/**
 * 组装 baseline 投影接地事实（纯读零写入；永不 throw——一切异常收敛为诚实降级位）。
 * state 派生复用 readBaselineConfirmation 单源（gate/presentation/grounding 四消费
 * 面同三态机）；manifest 缺席 = state "absent"（门不适用同边界：确认记录与 digest
 * 快照位整体空缺——确认平面不在场无快照可锚；tokens 是独立文件面，三态各自显式）。
 */
export async function readBaselineGroundingFacts(
  rootDir: string,
): Promise<BaselineGroundingFacts> {
  const [read, tokens, blocking] = await Promise.all([
    readBaselineConfirmation(rootDir),
    tokensFacts(rootDir),
    readBaselineBlockingPresentation(rootDir),
  ]);
  const tokensValue: BaselineTokensFacts = tokens;
  if (read.kind === "manifest-absent" || read.kind === "manifest-unreadable") {
    return {
      confirmation_ref: BASELINE_CONFIRMATION_REF,
      tokens_ref: BASELINE_DESIGN_TOKENS_TARGET,
      state: read.kind === "manifest-absent" ? "absent" : "unconfirmed",
      at_seq: null,
      blocking_remaining: null,
      targets: [...BASELINE_CONFIRM_TARGETS],
      drifted_files: [],
      pending_change: null,
      ack: null,
      confirmed_digests: null,
      current_digests:
        read.kind === "manifest-absent" ? {} : await currentDigestSnapshot(rootDir),
      tokens: tokensValue,
    };
  }
  if (read.kind === "record-invalid") {
    return {
      confirmation_ref: BASELINE_CONFIRMATION_REF,
      tokens_ref: BASELINE_DESIGN_TOKENS_TARGET,
      state: "unconfirmed",
      at_seq: null,
      blocking_remaining: blocking.remaining,
      targets: [...BASELINE_CONFIRM_TARGETS],
      drifted_files: [],
      pending_change: null,
      ack: null,
      confirmed_digests: null,
      current_digests: await currentDigestSnapshot(rootDir),
      tokens: tokensValue,
    };
  }
  return {
    confirmation_ref: BASELINE_CONFIRMATION_REF,
    tokens_ref: BASELINE_DESIGN_TOKENS_TARGET,
    state: read.state,
    at_seq: read.record.at_seq,
    blocking_remaining: blocking.remaining,
    targets: [...BASELINE_CONFIRM_TARGETS],
    drifted_files: read.mismatches.map((mismatch) => mismatch.target).sort(),
    pending_change:
      read.record.pending === undefined
        ? null
        : {
            change_ref: read.record.pending.change_ref,
            batch: [...read.record.pending.batch],
          },
    ack:
      read.record.ack === undefined
        ? null
        : { note: read.record.ack.note, files: [...read.record.ack.files] },
    confirmed_digests: { ...read.record.digests },
    current_digests: await currentDigestSnapshot(rootDir),
    tokens: tokensValue,
  };
}
