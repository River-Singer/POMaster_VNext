/**
 * adapter-types.ts —— Gate Adapter 接口契约（PRD §59 Tool Adapter Contract）与探测/判卷共用类型。
 *
 * §59 原文契约（POMaster-vNext-PRD-v0.4.md §59）：
 *   interface GateAdapter { detect(project); prepare(scope, policy); run(plan); normalize(raw); }
 *   核心不得依赖第三方控制台文本格式。
 * 本仓分层落位（docs/architecture.md）：gauntlet-lite 与外部测试工具走 Adapter（绝不进核心）——
 * 第三方控制台文本（vitest JSON 等）止步于 adapter 的 run/normalize 内，跨出本包边界的只有
 * 归一后的 GateResultRecord（@pomaster/kernel 的 GateResult 契约形态）。
 *
 * 全局纪律锚：
 * - 词表纪律：DetectionStatus 四态来自 research/testing-toolchain-shipping-plan.md「缺席语义」
 *   （READY/DRIFTED/NOT_INSTALLED/NOT_REQUIRED_BY_PROFILE），vocabulary-lock 尚无此轴
 *   → TODO(vocab-pr)：待词汇表 PR 收编，收编前冻结于本文件（禁止就地扩值）。
 *   verdict 七态一律取 @pomaster/schemas 的 VERDICT_VALUES（唯一镜像点），本文件不复制词值。
 * - C1 门禁四态/缺席显式哲学：adapter 无法执行时必须产出显式状态（not_run 等），
 *   禁止静默跳过当通过；SKIPPED_BY_POLICY（not_run 收敛义）与 PASS 在账本中是不同记录。
 * - C5 永不信任自报值：工具/Agent 声称的判词（declaredVerdict）与计数（trust.asserted）
 *   只作 CLAIMED 记录；判卷以重算（trust.recomputed）为准，失配即一级信号。
 * - A4 幂等：判卷输入禁墙钟时间（grn/ranAtSeq 由编排层的单调序号供给）；
 *   durationMs 是耗时统计（03 schema 中 digest 排除字段），允许机器实测，不参与身份。
 */
import type { GateResult, GovernedId } from "@pomaster/kernel";
import type { RunTriggerValue } from "@pomaster/schemas";

// ============================================================
// 探测（detect）——缺席四态语义
// ============================================================

/**
 * 工具探测四态（x-vocab-source: research/testing-toolchain-shipping-plan.md「缺席语义」）：
 * READY=找到且匹配 | DRIFTED=版本漂移（判卷降级 WARNING）| NOT_INSTALLED=缺席（→ not_run，非绿非红）|
 * NOT_REQUIRED_BY_PROFILE=profile 未要求（合法缺席，显式计数，非静默跳过）。
 * TODO(vocab-pr)：四态词形待词汇表 PR 收编 vocab-lock，收编前禁止扩值。
 */
export type DetectionStatus =
  | "READY"
  | "DRIFTED"
  | "NOT_INSTALLED"
  | "NOT_REQUIRED_BY_PROFILE";

/**
 * 探测结果（判别联合：非法态不可表达——NOT_INSTALLED 必带缺席理由 reason 与安装建议 installHint，
 * READY 必带发现线索 evidence；报错带路标纪律：缺席输出必须说清去哪装）。
 */
export type DetectionResult =
  | {
      readonly status: "READY";
      readonly tool: string;
      /** 探测到的版本（semver）；版本不可探测时为 null（READY 不强求版本）。 */
      readonly detectedVersion: string | null;
      /** 发现线索（PATH 命中路径 / 配置文件路径 / .mcp.json server key）。 */
      readonly evidence: string;
    }
  | {
      readonly status: "DRIFTED";
      readonly tool: string;
      readonly detectedVersion: string;
      readonly expectedVersion: string;
      readonly evidence: string;
      /** 版本对齐建议文本。 */
      readonly installHint: string;
    }
  | {
      readonly status: "NOT_INSTALLED";
      readonly tool: string;
      /** 缺席理由（非空，可判卷）。 */
      readonly reason: string;
      /** 安装/配置建议文本（非空——缺席必须带路标）。 */
      readonly installHint: string;
    }
  | {
      readonly status: "NOT_REQUIRED_BY_PROFILE";
      readonly tool: string;
      /** 为何本 profile 不要求（非空）。 */
      readonly reason: string;
    };

/** 探测公共选项（各 detector 按语义子集消费）。 */
export interface DetectorOptions {
  /**
   * profile 是否要求本工具族 gate（默认 true）。false → NOT_REQUIRED_BY_PROFILE
   * （research 缺席语义：SKIPPED_BY_POLICY 收敛义 → not_run / notApplicable 计数，非静默）。
   */
  readonly requiredByProfile?: boolean;
  /** 版本锁定锚；与探测版本不等 → DRIFTED（仅版本可探测的工具消费）。 */
  readonly expectedVersion?: string | null;
}

/** BUILD adapter 探测结果（复合形态：两个 runner 各持四态，无信息丢失）。 */
export interface BuildToolDetection {
  /** READY = vitest 或 pytest 腿至少一个可执行；NOT_INSTALLED = 双腿全缺席。 */
  readonly status: DetectionStatus;
  readonly vitest: DetectionResult;
  readonly pytest: DetectionResult;
}

/**
 * 探测事实源（纯函数注入面）：真实实现见 detectors.ts platformDetectorFacts（node:fs），
 * 测试注入 fake（假 PATH/假配置目录），保证探测矩阵零 I/O 可单测。
 * joinPath/fileExists/readTextFile 三者必须同源一致（同一种路径拼接约定）。
 */
export interface DetectorFacts {
  readonly projectRoot: string;
  /** PATH 环境变量原文；null = 无 PATH（探测器按缺席处理，禁静默）。 */
  readonly pathEnv: string | null;
  readonly pathSeparator: string;
  readonly executableSuffixes: readonly string[];
  readonly joinPath: (base: string, rel: string) => string;
  readonly fileExists: (absolutePath: string) => boolean;
  readonly readTextFile: (absolutePath: string) => string | null;
}

// ============================================================
// 计划（prepare）与执行（run）
// ============================================================

/** 受检范围（八拍⑤ VERIFY 的输入侧）。 */
export interface GateScope {
  readonly projectRoot: string;
  /** 受检治理对象 id（可缺省：repo 级 gate 无单一 subject；closed-world 全文法校验归 kernel）。 */
  readonly subjectId?: string | null;
  /** 分母引用（C2：结论绑定所用分母 id+version；空数组=无分母的显式诚实声明）。 */
  readonly denominatorRefs?: readonly GateDenominatorRefInput[];
}

/** 分母引用输入（边界处为不受信字符串； GovernedId 文法校验归 kernel parseGovernedId）。 */
export interface GateDenominatorRefInput {
  readonly id: string;
  readonly versionSeen: number;
}

/** 门禁策略/运行上下文（prepare 的第二参数；编排层供给）。 */
export interface GatePolicy {
  /** 运行记录 id（GRN-[0-9]+；归一内联 pattern 校验，越形即 FATAL）。 */
  readonly grn: string;
  /** 全局事件序号（A4：单调 seq，禁墙钟）。 */
  readonly ranAtSeq: number;
  /** 触发方式（structural 词表，@pomaster/schemas RUN_TRIGGER_VALUES）。 */
  readonly trigger?: RunTriggerValue;
  /** 子进程超时 ms（缺省 DEFAULT_RUN_TIMEOUT_MS）。 */
  readonly timeoutMs?: number;
  /**
   * 期望的工具版本锚（如 catalog/profile 锁定版本）；与实际探测版本不等 →
   * 判卷降级 warning（research 缺席语义：DRIFTED→WARNING）。
   */
  readonly expectedToolVersion?: string | null;
}

/** 门禁执行计划（prepare 产物：纯数据，零 I/O；run 只消费 plan 不再探测）。 */
export interface GatePlan {
  /** 工具标识（03 schema tool pattern：^[a-z][a-z0-9_:@/.-]{0,127}$，如 gauntlet:vitest）。 */
  readonly tool: string;
  /** 工具版本（semver；来自探测的 sanitizeSemver 结果）。 */
  readonly toolVersion: string;
  /** 门禁名（SCREAMING_SNAKE；gate 名不属 vocab-lock 管辖，新增 gate 须经 gate_def 版本化登记）。 */
  readonly gate: string;
  /** 门禁定义锚（定义 id@semver，防口径静默漂移）。 */
  readonly gateDef: string;
  /** 度量口径声明（横切纪律 1：coverage 行/分支混用即口径漂移的结构性预防）。 */
  readonly metricDialect: string;
  readonly runner: "vitest" | "pytest";
  /** spawn 命令串（shell:true 形态——Windows 下 corepack/pnpm 为 .cmd shim，无 shell 不可解析）。 */
  readonly command: string;
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly grn: string;
  readonly ranAtSeq: number;
  readonly trigger: RunTriggerValue;
  readonly subjectId: string | null;
  readonly denominatorRefs: readonly GateDenominatorRefInput[];
  readonly expectedToolVersion: string | null;
}

/** 子进程执行结果（默认实现走 spawnSync shell:true；测试注入 fake）。 */
export interface SpawnOutcome {
  /** 进程退出码；null = 未能执行（spawn 失败/超时被杀）。 */
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** spawn 层错误消息（ENOENT/ETIMEDOUT 等）；null = 正常执行。 */
  readonly error: string | null;
  /** 子进程墙钟耗时 ms（C6 duration_ms.external 的来源；耗时不入 digest，允许实测）。 */
  readonly externalMs: number;
}

export type SpawnFn = (
  command: string,
  options: { readonly cwd: string; readonly timeoutMs: number },
) => SpawnOutcome;

/** run 产物（§59 的 run 原始输出；第三方控制台文本止步于本形态，禁止上抛进核心）。 */
export interface ToolRunOutput {
  readonly plan: GatePlan;
  readonly kind: "executed" | "spawn_failed";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly externalMs: number;
  /** spawn_failed 时的失败原因与路标（归一层据此落 not_run 判卷）。 */
  readonly failureReason: string | null;
  /**
   * run 期实测的工具版本（pytest 腿：`python -m pytest --version` 探测；vitest 腿省略）。
   * 观测值与 plan.expectedToolVersion 锚失配 → 判卷降级 warning（DRIFTED→WARNING）；
   * 记录落盘时观测值优先于计划锚（03 tool_version 记录实际执行的工具）。
   */
  readonly observedToolVersion?: string | null;
}

// ============================================================
// 归一（normalize）——CLAIMED → 03-gate-result 形态
// ============================================================

/** 归一上下文（声明侧输入；判卷侧一律重算）。 */
export interface NormalizeContext {
  /**
   * Agent/工具自报判词（CLAIMED，C5）：词表外值 → FATAL（verdict_out_of_vocab）；
   * 词表内值也**不采信**——最终 verdict 由重算得出，本字段只做词表闸门与留痕输入。
   */
  readonly declaredVerdict?: string | null;
  /** Q3 fixture 标记：subjectId 前缀 TEST.* ⇔ true 双向强校验，违者 FATAL。 */
  readonly isFixture?: boolean;
}

/**
 * 03-gate-result items[] 违规明细条目（判卷侧重算产物；不携带 excerpt_hash——
 * D24 哈希伦理：digest 只住读侧，adapter 不设任何算 sha 路径）。
 */
export interface GateResultItemInput {
  /** 违规规则码（gate_def 内定义）。 */
  readonly rule: string;
  /** 仓内相对路径[:line 或 #fragment]；禁止绝对盘符（provenance 可移植纪律）。 */
  readonly location: string;
  readonly message?: string;
}

/**
 * 归一后的门禁结果 = @pomaster/kernel 的 GateResult 契约形态（P12a 起 kernel 契约已承载
 * tool/toolVersion/metricDialect 三件套；此处交叉重声明为冗余但同型一致，保留以显式标注
 * GateRunner/adapter 侧「强制上报」职责）。可选扩展位（03 schema 合法字段；P12 红队修复
 * 起 kernel GateResult 原生承载，normalizeGateResult 解析 + gateResultToSnake 落盘贯通，
 * CLI 呈现与 GRN 账本同源）：
 * - scopeNote → 落盘 scope.note（缺席理由 / 安装指引 / 对账口径注记的诚实留痕位）；
 * - items/itemsTruncated → 落盘 items[] / items_truncated（违规明细与 x-budget 截断留痕）。
 */
export type GateResultRecord = GateResult & {
  readonly tool: string;
  readonly toolVersion: string;
  readonly metricDialect: string;
  readonly scopeNote?: string;
  readonly items?: readonly GateResultItemInput[];
  readonly itemsTruncated?: boolean;
};

/** 归一失败（FATAL，无 WARNING 档；报错带路标：message 必含 hint）。 */
export class GateNormalizeError extends Error {
  readonly reason:
    | "verdict_out_of_vocab"
    | "fixture_flag_mismatch"
    | "unknown_assertion_status"
    | "counts_not_finite"
    | "grn_format"
    | "ran_at_seq_invalid";
  readonly hint: string;

  constructor(
    reason: GateNormalizeError["reason"],
    detail: string,
    hint: string,
  ) {
    super(`${reason}: ${detail} — ${hint}`);
    this.name = "GateNormalizeError";
    this.reason = reason;
    this.hint = hint;
  }
}

/** adapter 编排失败（探测无可用 runner / runner 未实现等；显式拒绝，禁静默）。 */
export class GateAdapterError extends Error {
  readonly reason: "runner_not_ready" | "runner_not_implemented";
  readonly hint: string;

  constructor(
    reason: GateAdapterError["reason"],
    detail: string,
    hint: string,
  ) {
    super(`${reason}: ${detail} — ${hint}`);
    this.name = "GateAdapterError";
    this.reason = reason;
    this.hint = hint;
  }
}

/**
 * §59 GateAdapter 接口（本仓泛化形态）。
 * 语义分工：detect=环境探测（四态缺席显式）→ prepare=纯数据执行计划 →
 * run=执行（原始文本止步于此）→ normalize=判卷归一（七态 + notApplicable 必填 +
 * asserted/recomputed 孪生 + duration self/external 拆分）。
 */
export interface GateAdapter<
  TDetection = DetectionResult,
  TPlan = GatePlan,
  TRaw = ToolRunOutput,
> {
  readonly adapterId: string;
  detect(facts: DetectorFacts): TDetection;
  prepare(scope: GateScope, policy: GatePolicy, facts?: DetectorFacts): TPlan;
  run(plan: TPlan, spawnFn?: SpawnFn): TRaw;
  normalize(raw: TRaw, context: NormalizeContext): GateResultRecord;
}

/** 03-gate-result 线格式（snake_case 落盘形态，evidence/runs/GRN-*.json 用）。 */
export type GateResultJsonDocument = Readonly<Record<string, unknown>>;

/** GovernedId 边界收窄：全文法（closed-world 前缀/SEGMENT/SEQ）校验归 kernel parseGovernedId。 */
export function asGovernedId(id: string): GovernedId {
  return id as GovernedId;
}

/**
 * 包版本（tool_version 字段一律用被探测工具自身的 semver，本常量仅作 registry 元数据；
 * 自执行型 adapter——CONTRACT/ARCHITECTURE/BROWSER——的 tool_version 即本值）。
 * 住本文件（叶模块）而非 index.ts：三个新 adapter 引用它是取常量，避免环形 import。
 */
export const GAUNTLET_LITE_VERSION = "0.1.0" as const;
