/**
 * spec-routing.ts —— 协议目录路由（W4 切片；FR-02 Spec Catalog 路由；AC-09/10）。
 *
 * 定位（§92.2 同款边界纪律）：外部协议库（如 MASTer 77 份 *-protocol.md）的最小可路由
 * 字段**编译进 catalog 数据面的单一真值**（catalog 根下 spec-routing.json——原位演进，
 * 不为 Markdown 强加第二结构、不建第二索引真值、不复制协议正文）；本模块是该真值的
 * 唯一读取面 + 确定性路由核（routeSpecs，W4.2）。纯读零写、零治理事实；路由结果只进
 * catalogEntries（REUSE / CATALOG 策展分区），绝不进 mustEntries 判卷输入（§92.2
 * 「Catalog 不是第二套 Project Truth」；不因路由结果改变 Permit 或降低 REQUIRED 义务）。
 *
 * 最小可路由字段（W4.1 定稿；来源：W0 promotion 审计表 #9/#10 + MASTer spec-manifest
 * 外部材料结构 + research/dependency-authority-and-routing.md §4 方案 C）：
 * - semantic_id：机器身份（PROTOCOL.* 点族词形——**非 governed id**，SENSOR_ID_PATTERN
 *   先例：catalog 物料身份不受 governed 前缀闭包管辖；SPEC. 前缀已被 Evidence Spec 占用，
 *   禁借用）。机器关系（supersession/requires/conflicts/显式 reference）一律以
 *   semantic_id 承载——W3 stable-reference 合同预留：path 只做内容导航，永不进机器关系。
 * - path：内容导航（消费项目相对路径；context 编译按选择结果引用 path，不全量注入正文）。
 * - stage：规则作用域阶段（四值闭包 plan/implement/verify/maintain；过滤闸语义——W4.2）。
 * - triggers：任务触发词（词级精确 token 交集命中，禁子串/等价猜测——searchKnowledge 同款纪律）。
 * - stack：栈约束（**not_configured 轴**：任务未声明 stack ≠ 默认匹配——禁假绿红线）。
 * - superseded_by：显式退役声明（禁 mtime/文件名推断——W0 事故 #6「mtime 裁胜者」不采纳
 *   的路由面同款纪律）；声明即排除且可解释（呈现取代者）。
 * - requires/conflicts：overlay 依赖与互斥（缺依赖不静默当匹配；冲突按登记序去重）。
 * - source_sha256：编译时登记的来源指纹（呈现位；真值归登记者——协议源文件住消费项目，
 *   本仓不持有正文与副本）。
 *
 * opt-in 语义（loadCatalogArchetypes 目录缺席先例）：manifest 缺席 = null 显式返回
 * （未登记协议目录是合法状态）；在场则 fail-closed——unknown 键、词形外值、悬空引用、
 * 自引用一律 SCHEMA_INVALID（坏物料 ≠ catalog 缺席，禁静默当空表）。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GovernanceError } from "./errors.js";

type UnknownRecord = Record<string, unknown>;

/** manifest schema 词形（pomaster.<name>/<version> 词族；CONTEXT_MANIFEST_SCHEMA 同法式）。 */
export const SPEC_ROUTING_SCHEMA = "pomaster.spec-routing/1" as const;

/** manifest 文件名（catalog 根下；非 CATALOG_SECTIONS 管辖面——不受 catalog-lock 管辖）。 */
export const SPEC_ROUTING_MANIFEST_FILE = "spec-routing.json" as const;

/**
 * stage 四值闭包（开放扩值走词汇表 PR 注记——O4 留位先例的最小闭包起步）。
 * 语义：协议规则的作用阶段；stage 过滤闸见 routeSpecs（W4.2）。
 */
export const SPEC_ROUTING_STAGE_VALUES = [
  "plan",
  "implement",
  "verify",
  "maintain",
] as const;
export type SpecRoutingStageValue = (typeof SPEC_ROUTING_STAGE_VALUES)[number];

/**
 * PROTOCOL.* 点族词形（至少两段 SCREAMING_SNAKE；CATALOG_ARCHETYPE_ID_PATTERN 同法式）。
 * x-vocab-source: vocab-lock master_campaign_vocab.spec_routing_stage.semantic_id_note
 * （PR-0011 收编，Owner 裁定 1=A 2026-09-30 词汇表批扫——原 x-vocab-pr 留痕注记转正）：
 * PROTOCOL 非 governed 前缀（governed 闭包 16 前缀无语义适配位；catalog 物料身份词形）。
 */
export const PROTOCOL_ID_PATTERN = /^PROTOCOL\.[A-Z0-9_]+(\.[A-Z0-9_]+)+$/;

/** trigger/stack token 词形（词级精确匹配的载体：非空、无空白、小写起始；vue3/ag-grid 合法）。 */
export const ROUTING_TOKEN_PATTERN = /^[a-z0-9][a-z0-9+.\-_]*$/;

/** source_sha256 词形（sha256:<64hex>；sha256OfUtf8 同词形）。 */
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** 协议条目运行时消费形态（W4.1 最小可路由字段定稿）。 */
export interface SpecRoutingEntry {
  /** 机器身份（PROTOCOL.* 词形；全 manifest 唯一——身份面禁重复）。 */
  readonly semantic_id: string;
  /** 内容导航路径（消费项目相对 posix 词形；path 只导航不进机器关系——W3 预留）。 */
  readonly path: string;
  /** 作用阶段（空数组 = 不限阶段——stage 过滤闸不参与）。 */
  readonly stage: readonly SpecRoutingStageValue[];
  /** 任务触发词（词级精确 token 交集命中）。 */
  readonly triggers: readonly string[];
  /** 栈约束（非空时任务侧 stack 必须声明且相交——not_configured 禁假绿）。 */
  readonly stack: readonly string[];
  /** 无条件基线（装载面锁死与 stage/stack 互斥声明——语义单一化）。 */
  readonly always: boolean;
  /** 显式退役声明（在册取代者 semantic_id；null=在役；禁 mtime/文件名推断）。 */
  readonly superseded_by: string | null;
  /** overlay 依赖（semantic_id；缺依赖不静默当匹配）。 */
  readonly requires: readonly string[];
  /** overlay 互斥（semantic_id；冲突按 manifest 登记序去重）。 */
  readonly conflicts: readonly string[];
  /** 编译时登记的来源指纹（呈现位；sha256:<64hex> 词形）。 */
  readonly source_sha256: string;
  /** 人类注记（可选）。 */
  readonly note: string | null;
}

/** manifest 消费形态（profile 声明装载身份：universal-seed / project-overlay 等）。 */
export interface SpecRoutingManifest {
  readonly schema: typeof SPEC_ROUTING_SCHEMA;
  readonly profile: string;
  readonly entries: readonly SpecRoutingEntry[];
}

/** entry 合法键闭包（unknown 键 fail-closed——unknown 字段不静默当匹配）。 */
const ENTRY_KEYS = [
  "semantic_id",
  "path",
  "stage",
  "triggers",
  "stack",
  "always",
  "superseded_by",
  "requires",
  "conflicts",
  "source_sha256",
  "note",
] as const;

function failInvalid(message: string, hint: string, details: UnknownRecord): never {
  throw new GovernanceError("SCHEMA_INVALID", message, hint, details);
}

/**
 * 读 catalog 根下的协议路由 manifest（唯一读取面；纯读零写）。
 * - 缺席 → null（opt-in 空路由，显式返回——未登记 ≠ 空 ≠ 坏）；
 * - JSON 坏形 / schema / profile / entries 形状非法 / 条目词形与引用闭合违规 →
 *   SCHEMA_INVALID（fail-closed：坏物料 ≠ catalog 缺席，禁静默当空表）。
 * 输出保持 manifest 登记序（conflicts 去重的「登记序在先者保留」以本序为分母）。
 */
export function loadSpecRoutingManifest(catalogRoot: string): SpecRoutingManifest | null {
  const manifestPath = join(catalogRoot, SPEC_ROUTING_MANIFEST_FILE);
  if (!existsSync(manifestPath)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `spec-routing manifest 不可解析（JSON 坏形）: ${SPEC_ROUTING_MANIFEST_FILE}`,
      "协议路由目录是 catalog 数据面的单一真值（W4）；恢复 git 版本或修正 JSON 后重试。",
      { file: SPEC_ROUTING_MANIFEST_FILE, cause: String(error) },
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    failInvalid(
      `spec-routing manifest 形状非法（须对象）: ${SPEC_ROUTING_MANIFEST_FILE}`,
      "对照 catalog/spec-routing.json 在册形态修复。",
      { file: SPEC_ROUTING_MANIFEST_FILE },
    );
  }
  const body = parsed as UnknownRecord;
  if (body["schema"] !== SPEC_ROUTING_SCHEMA) {
    failInvalid(
      `spec-routing manifest schema 词形非法: ${SPEC_ROUTING_MANIFEST_FILE}（实为 ${String(body["schema"])}）`,
      `schema 恒 ${SPEC_ROUTING_SCHEMA}（pomaster.<name>/<version> 词族）；手改破坏形状请恢复 git 版本。`,
      { file: SPEC_ROUTING_MANIFEST_FILE },
    );
  }
  if (typeof body["profile"] !== "string" || body["profile"].length === 0) {
    failInvalid(
      `spec-routing manifest 缺 profile: ${SPEC_ROUTING_MANIFEST_FILE}`,
      "profile 声明装载身份（universal-seed / project-overlay）；缺席显式爆禁杜撰。",
      { file: SPEC_ROUTING_MANIFEST_FILE },
    );
  }
  const rawEntries = body["entries"];
  if (!Array.isArray(rawEntries)) {
    failInvalid(
      `spec-routing manifest entries 须为数组: ${SPEC_ROUTING_MANIFEST_FILE}`,
      "entries 是协议条目登记序分母（conflicts 去重的确定性依据）；手改破坏形状请恢复。",
      { file: SPEC_ROUTING_MANIFEST_FILE },
    );
  }
  const entries: SpecRoutingEntry[] = rawEntries.map((item, index) =>
    parseEntry(item, index),
  );
  // —— 引用闭合与唯一性（身份面禁重复 + ref-integrity 纪律：悬空引用显式爆） ——
  const known = new Set(entries.map((entry) => entry.semantic_id));
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.semantic_id)) {
      failInvalid(
        `spec-routing semantic_id 重复（身份面禁重复）: ${entry.semantic_id}`,
        "semantic_id 是机器身份（supersession/reference/requires 的承载键）；重复说明物料管理失序，删除或合并。",
        { semantic_id: entry.semantic_id },
      );
    }
    seen.add(entry.semantic_id);
    const references: [string, string][] = [
      ...(entry.superseded_by === null ? [] : [["superseded_by", entry.superseded_by] as [string, string]]),
      ...entry.requires.map((id) => ["requires", id] as [string, string]),
      ...entry.conflicts.map((id) => ["conflicts", id] as [string, string]),
    ];
    for (const [slot, id] of references) {
      if (!known.has(id)) {
        failInvalid(
          `spec-routing ${slot} 引用不在册: ${entry.semantic_id} → ${id}`,
          "引用闭合是装载面硬约束（ref-integrity 纪律）；悬空引用显式爆，禁静默当无依赖/无冲突。",
          { semantic_id: entry.semantic_id, slot, ref: id },
        );
      }
      if (id === entry.semantic_id) {
        failInvalid(
          `spec-routing ${slot} 自引用: ${entry.semantic_id}`,
          "自引用是物料失序痕迹（自己取代/依赖/冲突自己无语义）；对照在册条目修复。",
          { semantic_id: entry.semantic_id, slot },
        );
      }
    }
  }
  return {
    schema: SPEC_ROUTING_SCHEMA,
    profile: body["profile"],
    entries,
  };
}

/** 单条目解析（fail-closed 逐字段；index 为人类纠偏定位）。 */
function parseEntry(raw: unknown, index: number): SpecRoutingEntry {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    failInvalid(
      `spec-routing entries[${index}] 形状非法（须对象）`,
      "协议条目是对象；坏形显式爆禁静默跳过（静默 = 消费面假绿）。",
      { index },
    );
  }
  const record = raw as UnknownRecord;
  const unknownKeys = Object.keys(record).filter(
    (key) => !(ENTRY_KEYS as readonly string[]).includes(key),
  );
  if (unknownKeys.length > 0) {
    failInvalid(
      `spec-routing entries[${index}] 未知字段: ${unknownKeys.join("/")}（entry 键闭包）`,
      "unknown 字段不静默当匹配（W4 红线）——路由器不认识的字段必须显式爆而非静默忽略；扩字段走本模块 ENTRY_KEYS 定稿。",
      { index, unknown_keys: unknownKeys },
    );
  }
  const semanticId = record["semantic_id"];
  if (typeof semanticId !== "string" || !PROTOCOL_ID_PATTERN.test(semanticId)) {
    failInvalid(
      `spec-routing entries[${index}] semantic_id 词形非法（须 PROTOCOL.* 点族至少两段）: ${String(semanticId)}`,
      "semantic_id 是机器身份（PROTOCOL.* 点族——非 governed id，SPEC. 前缀被 Evidence Spec 占用禁借用）；词形随 PROTOCOL_ID_PATTERN。",
      { index, semantic_id: String(semanticId) },
    );
  }
  const path = record["path"];
  if (typeof path !== "string" || path.length === 0) {
    failInvalid(
      `spec-routing entries[${index}] path 缺失或空（${semanticId}）`,
      "path 是内容导航位（W3 stable-reference：机器关系以 semantic_id 承载，path 只导航）；缺席禁杜撰。",
      { index, semantic_id: semanticId },
    );
  }
  const stringArrayOf = (
    key: string,
    pattern: RegExp | null,
    absentDefault: readonly string[],
  ): string[] => {
    const raw = record[key];
    if (raw === undefined) return [...absentDefault];
    if (!Array.isArray(raw)) {
      failInvalid(
        `spec-routing entries[${index}] ${key} 须为数组（${semanticId}）`,
        `${key} 是机器路由字段；坏形显式爆。`,
        { index, semantic_id: semanticId, key },
      );
    }
    for (const item of raw) {
      if (typeof item !== "string" || (pattern !== null && !pattern.test(item))) {
        failInvalid(
          `spec-routing entries[${index}] ${key} 元素词形非法（${semanticId}）: ${String(item)}`,
          "词级精确 token 纪律：非空、无空白、小写起始（word boundary 之外的等价猜测一律拒绝）。",
          { index, semantic_id: semanticId, key, item: String(item) },
        );
      }
    }
    return raw as string[];
  };
  const stage: SpecRoutingStageValue[] = [];
  for (const item of stringArrayOf("stage", null, [])) {
    if (!SPEC_ROUTING_STAGE_VALUES.includes(item as never)) {
      failInvalid(
        `spec-routing entries[${index}] stage 词表外（${semanticId}）: ${item}`,
        `stage 须 ∈ SPEC_ROUTING_STAGE_VALUES（${SPEC_ROUTING_STAGE_VALUES.join("/")}）；扩值走词汇表 PR。`,
        { index, semantic_id: semanticId, stage: item },
      );
    }
    stage.push(item as SpecRoutingStageValue);
  }
  const always = record["always"] ?? false;
  if (typeof always !== "boolean") {
    failInvalid(
      `spec-routing entries[${index}] always 须为布尔（${semanticId}）`,
      "always 是无条件基线声明；坏形显式爆。",
      { index, semantic_id: semanticId },
    );
  }
  const entryStack = stringArrayOf("stack", ROUTING_TOKEN_PATTERN, []);
  const entryStage = stage;
  if (always && (entryStage.length > 0 || entryStack.length > 0)) {
    failInvalid(
      `spec-routing entries[${index}] always 与 stage/stack 互斥声明（${semanticId}）`,
      "always=无条件基线（语义单一化）：声明了作用域条件就不是 always；条件基线用 stage/stack 字段非 always 条目表达。",
      { index, semantic_id: semanticId },
    );
  }
  const supersededRaw = record["superseded_by"] ?? null;
  if (
    supersededRaw !== null &&
    (typeof supersededRaw !== "string" || !PROTOCOL_ID_PATTERN.test(supersededRaw))
  ) {
    failInvalid(
      `spec-routing entries[${index}] superseded_by 词形非法（${semanticId}）: ${String(supersededRaw)}`,
      "superseded_by 是显式退役声明（在册取代者 semantic_id 或 null）；禁 mtime/文件名推断（W0 事故 #6 同款纪律）。",
      { index, semantic_id: semanticId },
    );
  }
  const sourceSha256 = record["source_sha256"];
  if (typeof sourceSha256 !== "string" || !SHA256_PATTERN.test(sourceSha256)) {
    failInvalid(
      `spec-routing entries[${index}] source_sha256 缺失或词形非法（${semanticId}）: ${String(sourceSha256)}`,
      "来源指纹显式登记（sha256:<64hex>，sha256OfUtf8 同词形）；禁 mtime/时间戳推断——指纹真值归编译登记者。",
      { index, semantic_id: semanticId },
    );
  }
  const noteRaw = record["note"] ?? null;
  if (noteRaw !== null && typeof noteRaw !== "string") {
    failInvalid(
      `spec-routing entries[${index}] note 须为字符串或 null（${semanticId}）`,
      "note 是人类注记位；坏形显式爆。",
      { index, semantic_id: semanticId },
    );
  }
  return {
    semantic_id: semanticId,
    path,
    stage: entryStage,
    triggers: stringArrayOf("triggers", ROUTING_TOKEN_PATTERN, []),
    stack: entryStack,
    always,
    superseded_by: supersededRaw,
    requires: stringArrayOf("requires", PROTOCOL_ID_PATTERN, []),
    conflicts: stringArrayOf("conflicts", PROTOCOL_ID_PATTERN, []),
    source_sha256: sourceSha256,
    note: noteRaw,
  };
}

// ============================================================
// 确定性路由核（W4.2 选择与解释；同输入重放字节稳定——A4）
// ============================================================

/** 路由请求侧输入（全部可缺席；缺席语义逐轴显式——禁假绿）。 */
export interface SpecRoutingInput {
  /** 任务阶段（∈ SPEC_ROUTING_STAGE_VALUES；null=未提供——stage 过滤闸不参与）。 */
  readonly stage: SpecRoutingStageValue | null;
  /** 任务触发词（词级精确 token；与条目 triggers 精确交集命中，禁子串/等价猜测）。 */
  readonly triggers: readonly string[];
  /**
   * 任务技术栈声明（null=未声明——**not_configured 轴**：声明了 stack 的协议一律排除，
   * 未配置 ≠ 默认匹配，禁假绿红线；声明了则按交集判定）。
   */
  readonly stack: readonly string[] | null;
  /** 显式 reference（semantic_id 精确点名——绕过 stage/stack 闸；supersession 闸仍然优先）。 */
  readonly specRefs: readonly string[];
}

/** 命中通道词形闭包（决策 channels 面）。 */
export const SPEC_ROUTING_CHANNEL_VALUES = [
  "explicit",
  "always",
  "stage",
  "trigger",
] as const;
export type SpecRoutingChannelValue = (typeof SPEC_ROUTING_CHANNEL_VALUES)[number];

/** 单份协议的路由决策（included=why selected；excluded=why not——全分母逐条可解释）。 */
export interface SpecRoutingDecision {
  readonly semantic_id: string;
  /** 内容导航路径（呈现位；机器关系以 semantic_id 承载——W3 stable-reference 预留）。 */
  readonly path: string;
  /** 来源指纹（编译时登记的声明指纹，呈现不自算）。 */
  readonly source_sha256: string;
  readonly included: boolean;
  /** 命中通道（included 时非空；explicit/always/stage/trigger——多通道命中全列）。 */
  readonly channels: readonly SpecRoutingChannelValue[];
  /** 人读理由（included=选中理由；excluded=排除理由，缺席/未命中显式）。 */
  readonly why: string;
}

/**
 * 确定性路由核（纯函数；同输入重放 decisions 字节稳定）。
 *
 * 判定序（每份协议，优先级从高到低）：
 * 1) **supersession 闸**：superseded_by 非 null → 排除，理由携带取代者（显式元数据
 *    声明——禁 mtime/文件名推断；优先于显式 reference：退役即退役，点名只换来解释）；
 * 2) **候选通道并集**：always 基线 ∪ trigger 词级精确交集 ∪ 显式 reference；三者全不中
 *    → 排除（无命中通道，理由列出 trigger 未命中与 stage 不匹配提示）；
 * 3) **stage 过滤闸**（explicit 通道豁免——人类点名优先）：条目声明 stage 且任务提供
 *    stage 且不含 → 排除；任务未提供 stage → 闸不参与（stage 轴缺席=不过滤）；
 * 4) **stack 过滤闸**（explicit 豁免同上）：条目声明 stack 时任务必须已声明 stack 且
 *    相交——未声明 → not_configured 排除（未配置 ≠ 默认匹配）；无交集 → 排除；
 * 5) **requires 依赖迭代剔除**：候选的依赖不在候选集 → 剔除（级联收敛——传递缺依赖
 *    全链剔除；缺依赖不静默当匹配）；
 * 6) **conflicts 登记序去重**：互斥对都在候选集 → 保留 manifest 登记序在先者
 *    （确定性：登记序即文件 entries 数组序）。
 *
 * 输出 = 全分母决策按 semantic_id 字典序（同输入同输出的可复现性；included 子集
 * 即注入集，消费方以 decisions.filter(included) 取用）。
 */
export function routeSpecs(
  manifest: SpecRoutingManifest,
  input: SpecRoutingInput,
): readonly SpecRoutingDecision[] {
  const explicitSet = new Set(input.specRefs);

  // —— 1..4：supersession 闸 → 通道并集 → stage/stack 过滤闸（中间候选集） ——
  const gateNotes = new Map<string, string>();
  const candidates = new Set<string>();
  const channelsById = new Map<string, SpecRoutingChannelValue[]>();
  for (const entry of manifest.entries) {
    const id = entry.semantic_id;
    if (entry.superseded_by !== null) {
      gateNotes.set(
        id,
        `superseded：显式元数据声明被 ${entry.superseded_by} 取代（退役即退役——禁 mtime/文件名推断；显式 reference 点名也不注入本体，请改引用取代者）`,
      );
      continue;
    }
    const channels: SpecRoutingChannelValue[] = [];
    const whyParts: string[] = [];
    if (explicitSet.has(id)) {
      channels.push("explicit");
      whyParts.push("explicit reference 点名（绕过 stage/stack 闸）");
    }
    if (entry.always) {
      channels.push("always");
      whyParts.push("always 基线（无条件注入）");
    }
    const triggerHits =
      input.triggers.length === 0
        ? []
        : entry.triggers.filter((trigger) => input.triggers.includes(trigger));
    if (triggerHits.length > 0) {
      channels.push("trigger");
      whyParts.push(`trigger 词级命中=${triggerHits.join("/")}`);
    }
    const stageHit = input.stage !== null && entry.stage.includes(input.stage);
    if (stageHit && channels.length === 0) {
      // stage 命中只在其他通道在场时作为过滤闸的通过注记——stage 不是独立命中通道
      //（「按 stage 过滤」语义：它过滤候选，不制造候选；无 always/trigger/explicit
      // 命中的条目不因阶段相符而注入——否则接近全量加载，违背精准选择目标）。
      whyParts.push(`stage=${input.stage} 相符（但无 always/trigger/explicit 命中通道）`);
    } else if (!stageHit && input.stage !== null && entry.stage.length > 0) {
      whyParts.push(
        `stage=[${entry.stage.join("/")}] 不含任务 stage=${input.stage}`,
      );
    }
    if (channels.length === 0) {
      gateNotes.set(
        id,
        `无命中通道（${whyParts.length > 0 ? whyParts.join("；") : "非 always、无显式 reference、triggers 未声明"}）`,
      );
      continue;
    }
    // —— stage 过滤闸（explicit 豁免） ——
    if (
      !channels.includes("explicit") &&
      input.stage !== null &&
      entry.stage.length > 0 &&
      !entry.stage.includes(input.stage)
    ) {
      gateNotes.set(
        id,
        `stage 过滤：[${entry.stage.join("/")}] 不含任务 stage=${input.stage}（${whyParts.join("；")}）`,
      );
      continue;
    }
    // —— stack 过滤闸（explicit 豁免；not_configured 不假绿） ——
    if (!channels.includes("explicit") && entry.stack.length > 0) {
      if (input.stack === null) {
        gateNotes.set(
          id,
          `stack=[${entry.stack.join("/")}] 声明而任务未声明 stack（not_configured——未配置 ≠ 默认匹配，禁假绿）`,
        );
        continue;
      }
      const stackHits = entry.stack.filter((stack) => input.stack?.includes(stack) === true);
      if (stackHits.length === 0) {
        gateNotes.set(
          id,
          `stack=[${entry.stack.join("/")}] 与任务 stack=[${input.stack.join("/")}] 无交集`,
        );
        continue;
      }
      whyParts.push(`stack 命中=${stackHits.join("/")}`);
    }
    candidates.add(id);
    channelsById.set(id, channels);
    gateNotes.set(id, `${whyParts.join("；")}`);
  }

  // —— 5：requires 依赖迭代剔除（级联收敛；缺依赖不静默当匹配） ——
  let stable = false;
  while (!stable) {
    stable = true;
    for (const entry of manifest.entries) {
      if (!candidates.has(entry.semantic_id)) continue;
      const missing = entry.requires.filter((dep) => !candidates.has(dep));
      if (missing.length > 0) {
        candidates.delete(entry.semantic_id);
        gateNotes.set(
          entry.semantic_id,
          `缺依赖：requires=[${missing.join("/")}] 未随选（缺依赖不静默当匹配——依赖未入选则本条目一并剔除）`,
        );
        stable = false; // 剔除可能级联（依赖本条目的上游也要重查）
      }
    }
  }

  // —— 6：conflicts 登记序去重（登记序 = manifest entries 数组序，确定性） ——
  for (const entry of manifest.entries) {
    if (!candidates.has(entry.semantic_id)) continue;
    for (const rival of entry.conflicts) {
      if (rival === entry.semantic_id) continue;
      if (candidates.has(rival)) {
        candidates.delete(rival);
        gateNotes.set(
          rival,
          `conflicts 去重：与 ${entry.semantic_id} 互斥（overlay conflicts——manifest 登记序在先者保留）`,
        );
      }
    }
  }

  // —— 全分母决策输出（semantic_id 字典序；included 理由带来源身份/指纹呈现位） ——
  const decisions: SpecRoutingDecision[] = manifest.entries
    .map((entry) => {
      const included = candidates.has(entry.semantic_id);
      return {
        semantic_id: entry.semantic_id,
        path: entry.path,
        source_sha256: entry.source_sha256,
        included,
        channels: included ? (channelsById.get(entry.semantic_id) ?? []) : [],
        why: gateNotes.get(entry.semantic_id) ?? (included ? "命中" : "未入选"),
      };
    })
    .sort((a, b) => (a.semantic_id < b.semantic_id ? -1 : a.semantic_id > b.semantic_id ? 1 : 0));
  return decisions;
}
