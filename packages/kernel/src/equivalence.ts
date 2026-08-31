/**
 * equivalence.ts —— 跨域联结词形等价登记内核（P31 · GRN-4402 转译 / A13 · OPEN-M6-12）。
 *
 * 出处锚（逐条裁定注记出处锚纪律）：
 * - docs/wave3-research-gaps.md §3（L94-107，GRN-4402 词形漂移 → 产品需求转译；
 *   OPEN-M6-12；gaps §5 A13「跨域引用联结键治理对象」）；docs/wave3-plan.md P31。
 * - GRN-4402 断链三层（gaps §3 L99-102）：①工具内硬编码映射表不是治理对象；
 *   ②公式侧中文（密度/单价/夹紧力）vs 源 id 侧拼音（FIELD.MATERIAL-DB.MIDU）精确
 *   命中 0、无等价登记；③页域散文词形（数量(#5) / KPI#5 [RMB/pc.]）无 governed 联结键。
 *
 * 三条现行纪律（gaps §3 L103 逐字「产品化时必须保住」——本模块的结构性落法）：
 * ① 只登记不裁决：等价表是声明性事实不是裁决权行使——无 declared_by 显式声明的
 *    等价对落 pending 桶而非 active（registerEquivalence 无 declaredBy 结构性写不出
 *    active）；kernel 不判申报真（C5 自报，declared_by 只登记声明事实）。Authority
 *    声明时机械清理重叠 pending 队列条目是声明事实的簿记后果（journal 留痕），
 *    不是 kernel 裁决。
 * ② 禁启发式/子串猜测：解析面只做 active 登记 word_forms[].text 的全等精确匹配
 *    （查询 trim 后逐字符相等——登记侧已 trim，零其他归一：禁大小写/NFKC 折叠、
 *    禁子串、禁编辑距离、禁模糊匹配；FE↔frontend、MIDU↔密度 未登记等价不猜测，
 *    P28 检索纪律「词级精确、禁子串/等价猜测」同源）。机械入册不判域（domain 恒
 *    unknown——判域即启发式；显式未知非猜测，域标记由 Authority 声明时补登）。
 * ③ 判不了显式 unresolved 而非假绿：未命中 active 登记 → status=unresolved
 *    （canonical=null）+ 机械入册 pending 裁决队列，绝不静默返回「最近似」候选；
 *    联结覆盖率指标分母封闭（resolved+pending+unresolved=total），盲区数以
 *    unchecked_in_blindspot_estimated 同型指标显式呈现（03 GateCounts 同名键位，
 *    skipped_blindspot 证据链纪律）。
 *
 * 词表纪律：domain 轴（WORD_FORM_DOMAIN_VALUES 六值）/ status 轴
 * （EQUIVALENCE_STATUS_VALUES 两值）唯一来源 @pomaster/schemas vocab.ts 待收编段
 * （镜像 13-equivalence-registry definitions；pending_vocab_pr 提请词汇表 PR 收编，
 * 本文件不发明词值）。EQG-n 是通路编号词形（GRN-/CLM-/EXC-/AGX-/SA-nnnn 同族先例），
 * 非 governed 前缀，不入 GOVERNED_ID_PREFIXES 闭包、不过 parseGovernedId。
 *
 * D15/A6 挂接：在既有 Key Binding / alias 双向链体系上扩展词形轴——联结键解析
 * 三腿链 resolveLinkageWordForm（①精确 id：parseGovernedId 全过 = 精确 governed id
 * 引用，A5 closed-world 下词形即 id；②未命中走等价表 active 登记精确匹配；③仍未
 * 命中落 pending 桶 + 引用显式 unresolved）。A6 别名双向链语义保住：机械别名族
 * （ALIASES_V0，词汇表 PR 声明过的等价——declared 面既有事实）作为精确 id 腿的
 * canonical 化前置（resolveAlias 产出 canonical 后仍过 parseGovernedId 验证），
 * leg 序不变（先 id 空间后等价表）；resolveAlias 本体零改动（既有测试零回归）。
 * 反向查找 wordFormsFor（canonical → 等价词形）与 inverseLegacyForms 考古方向同构。
 *
 * 存储与写入（模式同 knowledge.ts / ledger.ts 侧车先例）：
 * - state/equivalence-registry.json（kernel 内部补充状态，不进 content_digest）；
 * - staged write（executeWrites + captureOriginal），失败不落半写状态；
 * - 损坏/手改 fail-closed（装载面结构校验 + 跨条目不变式：组号唯一、词形 text
 *   全域唯一——text→唯一条目是解析确定性的结构保证，alias 三重查重同源纪律）；
 * - journal 事件流：EQUIVALENCE_DECLARED / EQUIVALENCE_PENDING_RECORDED /
 *   EQUIVALENCE_PENDING_EXTENDED（A4 事件拍，禁墙钟）。
 */
import type { Actor, Store } from "./index.js";
import { GovernanceError, GovernedIdParseError } from "./errors.js";
import { governanceCodeForParseError } from "./errors.js";
import { parseGovernedId, resolveAlias } from "./id.js";
import { captureOriginal, executeWrites, readText } from "./io.js";
import { pathsOf, readCurrentSeq, type StorePaths } from "./paths.js";
import {
  EQUIVALENCE_STATUS_VALUES,
  WORD_FORM_DOMAIN_VALUES,
  type EquivalenceStatusValue,
  type WordFormDomainValue,
} from "./vocab.js";

/** 等价登记表相对路径（kernel 内部补充状态；不进 content_digest）。 */
export const EQUIVALENCE_REGISTRY_RELATIVE =
  ".pomaster/state/equivalence-registry.json";

/** EQG-n 通路编号词形（GRN-/CLM-/EXC-/AGX-/SA-nnnn 同族先例；非 governed 前缀）。 */
export const EQUIVALENCE_GROUP_PATTERN = /^EQG-[0-9]+$/;

// ============================================================
// 类型（文件世界 snake_case / 输入世界 camelCase，同 ledger 分工）
// ============================================================

/** 词形（13-equivalence-registry definitions.word_form 镜像）。 */
export interface EquivalenceWordForm {
  /** 登记原文（登记侧 trim 归一空白边缘后逐字符精确；解析面全等匹配唯一依据）。 */
  readonly text: string;
  /** 语言域标记（六值闭包；机械入册恒 unknown——禁启发式判域）。 */
  readonly domain: WordFormDomainValue;
  /** 登记出处锚（每条裁定注记出处锚纪律的逐词形落点）。 */
  readonly source_ref: string;
}

/** 等价声明者（C5 自报——kernel 不判其真，只登记声明事实；登记≠裁决）。 */
export interface EquivalenceDeclarationAudit {
  readonly actor_type: Actor["actorType"];
  readonly actor: string;
  readonly self_attested: boolean;
}

/** 事件拍沿革（A4 禁墙钟；11-exception-ledger recorded_at_seq 先例）。 */
export interface EquivalenceProvenance {
  readonly recorded_at_seq: number;
  readonly declared_at_seq: number | null;
}

/**
 * 等价登记条目（state/equivalence-registry.json entries[]；镜像
 * 13-equivalence-registry definitions.equivalence_entry）。
 */
export interface EquivalenceEntry {
  /** EQG-n 组号（kernel 单调分配永不复用，A4；表内唯一）。 */
  readonly equivalence_group: string;
  /** 一组互等价词形（条目内 text 互异；跨条目 text 全域唯一）。 */
  readonly word_forms: readonly EquivalenceWordForm[];
  /** active=已获显式声明（解析面唯一可命中）；pending=未获声明候选（禁假绿）。 */
  readonly status: EquivalenceStatusValue;
  /** active 必非空 / pending 恒 null（allOf 条件式；装载面复核）。 */
  readonly declared_by: EquivalenceDeclarationAudit | null;
  /** 声明出处锚（active 必非空 / pending 恒 null）。 */
  readonly declaration_ref: string | null;
  readonly provenance: EquivalenceProvenance;
  /** 人类散文注记（P9：只登记不解析）。 */
  readonly note: string | null;
}

/** 登记表文件形态。 */
export interface EquivalenceRegistryFile {
  readonly version: 1;
  /** 已分配最大组号（EQG-n 单调分配永不复用；0=空表；装载面校验 ≥ 在册最大 n）。 */
  readonly group_seq: number;
  readonly entries: readonly EquivalenceEntry[];
}

// ============================================================
// 输入类型
// ============================================================

/** 词形输入（camelCase；domain 为词表词形字符串，登记面闸校验）。 */
export interface EquivalenceWordFormInput {
  readonly text: string;
  readonly domain: string;
  readonly sourceRef: string;
}

/**
 * registerEquivalence 输入。declaredBy 缺席 ⇒ pending 桶（declared-equivalence-only）；
 * 携带 declaredBy ⇒ active（declarationRef 必填——声明出处锚）。
 */
export interface EquivalenceRegistrationInput {
  readonly wordForms: readonly EquivalenceWordFormInput[];
  /** 声明者（缺席 = 未获声明 → pending）。 */
  readonly declaredBy?: Actor;
  /** 声明出处锚（active 必填；pending 禁携带）。 */
  readonly declarationRef?: string;
  readonly note?: string;
}

/** recordPendingEquivalence 输入（机械入册面；encounter 自动入册共用本入口）。 */
export interface PendingRecordInput {
  readonly wordForms: readonly EquivalenceWordFormInput[];
  /** 登记主体（缺席 = kernel 自身——机械入册是 kernel 簿记）。 */
  readonly recordedBy?: Actor;
  readonly note?: string;
}

/** 机械入册结果三态：created=新候选入队 / extended=既有候选扩员 / noop=已在队（dedupe）。 */
export interface PendingRecordOutcome {
  readonly registered: boolean;
  readonly mode: "created" | "extended" | "noop";
  readonly entry: EquivalenceEntry | null;
  /** noop/extended 时的既有候选组号。 */
  readonly existingGroup: string | null;
}

// ============================================================
// 解析类型
// ============================================================

/** resolveWordForm 结果（纯函数；declared-equivalence-only 的解析面契约）。 */
export interface WordFormResolution {
  readonly input: string;
  readonly status: "resolved" | "unresolved";
  /** resolved 恒 "equivalence_active"（active 登记精确匹配是唯一解析来源）。 */
  readonly via: "equivalence_active" | null;
  /** resolved = 组内 canonical 位词形文本（governed id）；unresolved 恒 null（禁猜测）。 */
  readonly canonical: string | null;
  readonly group: string | null;
  /** unresolved 的显式路标（禁猜测纪律注记）。 */
  readonly note: string | null;
}

/** 联结键解析来源（三腿链腿位词形；非 verdict 词表——呈现/判卷消费位）。 */
export type LinkageVia =
  | "exact_id"
  | "exact_id_via_alias"
  | "equivalence_active";

/**
 * resolveLinkageWordForm 结果（D15/A6 挂接的三腿链产物）。
 * unresolved=true 是引用级显式标记（绝不静默）。
 */
export interface LinkageResolution {
  readonly input: string;
  readonly status: "resolved" | "unresolved";
  readonly via: LinkageVia | null;
  readonly canonical: string | null;
  /** via=equivalence_active 时的等价组号；其余腿 null。 */
  readonly group: string | null;
  /** via=exact_id_via_alias 时命中的 ALIASES_V0 规则 legacy 词形；其余 null。 */
  readonly aliasRule: string | null;
  /** 引用标记 unresolved（显式；与 status 同步冗余呈现便于消费方直读）。 */
  readonly unresolved: boolean;
  /** unresolved 时机械入册结果（dedupe 后 noop 也显式呈现）；resolved 恒 null。 */
  readonly pending: {
    readonly registered: boolean;
    readonly group: string | null;
  } | null;
  readonly note: string | null;
}

/** resolveLinkageWordForm 输入。 */
export interface LinkageResolveInput {
  /** 联结键词形（对象引用字段原文，如 field ref / contract ref 槽位值）。 */
  readonly text: string;
  /**
   * 显式候选词形（声明结构给出的配对面——如 GRN-4402 机械展开的源 id 锚；非启发式
   * 猜测，调用方须自证出处）。缺席 = 单词形 encounter（纯盲区登记）。
   */
  readonly candidates?: readonly EquivalenceWordFormInput[];
  /** encounter 出处锚（必填——登记出处锚纪律；随 pending 条目留档）。 */
  readonly encounterRef: string;
  readonly note?: string;
}

// ============================================================
// 覆盖率盲区指标（03 FROZEN 盲区证据链同型；分母封闭）
// ============================================================

/** 联结尝试结果词形（computeLinkageCoverage 的输入判别位）。 */
export type LinkageAttemptOutcome =
  | "resolved_exact_id"
  | "resolved_exact_id_via_alias"
  | "resolved_equivalence_active"
  | "pending_registered"
  | "unresolved_blindspot";

export interface LinkageAttempt {
  readonly input: string;
  readonly outcome: LinkageAttemptOutcome;
}

/**
 * 联结覆盖率指标（分母封闭：resolved+pending+unresolved=total 三查）。
 * - pending = 已机械入册等裁决的未登记联结（裁决队列有料）；
 * - unresolved = 连候选配对都无料的纯盲区（unchecked_in_blindspot_estimated 同型，
 *   03 GateCounts.uncheckedInBlindspotEstimated 同名键位）；
 * - coverageRatio = resolved/total；total=0 → 0 + zeroDenominator=true
 *   （零分母禁当满分——P26 零分母假绿封死同款）。
 */
export interface LinkageCoverage {
  readonly total: number;
  readonly resolved: number;
  readonly pending: number;
  readonly unresolved: number;
  readonly coverageRatio: number;
  readonly zeroDenominator: boolean;
  readonly uncheckedInBlindspotEstimated: number;
}

/** 词形域标记词表闸（防篡改探测：词表外值显式拒绝，normalizeClassificationValue 先例）。 */
export function normalizeWordFormDomain(value: string): WordFormDomainValue {
  const matched = WORD_FORM_DOMAIN_VALUES.find((candidate) => candidate === value);
  if (matched === undefined) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `domain 词表外：${value}（13-equivalence-registry definitions.word_form_domain 六值闭包）`,
      `合法词形：${WORD_FORM_DOMAIN_VALUES.join(" | ")}；扩值走词汇表 PR（pending_vocab_pr）`,
      { domain: value },
    );
  }
  return matched;
}

// ============================================================
// 读取（装载面 fail-closed；kernel 内部跨模块复用 + CLI 纯读呈现共用语义）
// ============================================================

/**
 * 读取等价登记表。缺失 → 空表（opt-in 登记面，无等价登记是合法状态）；损坏/手改 →
 * SCHEMA_INVALID fail-closed（禁静默当空表）。装载面校验：
 * - 逐条目结构（词形必填/域词表/状态词表/声明位 allOf 条件式/provenance 事件拍）；
 * - active 形态封条（≥2 词形 + 恰一 canonical 位 + canonical 过 governed id 文法 +
 *   声明位齐备）与 pending 声明位恒 null；
 * - 跨条目不变式：组号唯一、词形 text 全域唯一（text→唯一条目 = 解析确定性）、
 *   group_seq ≥ 在册最大组号（单调不复用，回卷=手改痕迹）。
 */
export function readEquivalenceRegistry(
  paths: StorePaths,
): EquivalenceRegistryFile {
  const text = readText(paths.equivalenceRegistryPath);
  if (text === null) {
    return { version: 1, group_seq: 0, entries: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "state/equivalence-registry.json 无法解析（损坏或手改）",
      "恢复 git 版本；等价登记表由 kernel equivalence.ts 语义入口维护，禁止手改",
      { cause: String(error) },
    );
  }
  const record = parsed as EquivalenceRegistryFile;
  if (
    record === null ||
    typeof record !== "object" ||
    Array.isArray(record)
  ) {
    throw registryInvalid("结构非法（根非对象）");
  }
  if (record.version !== 1) {
    throw registryInvalid(`version 非法：${String(record.version)}（须为 1）`);
  }
  if (
    typeof record.group_seq !== "number" ||
    !Number.isInteger(record.group_seq) ||
    record.group_seq < 0
  ) {
    throw registryInvalid("group_seq 非法（须为非负整数）");
  }
  if (!Array.isArray(record.entries)) {
    throw registryInvalid("结构非法（entries 非数组）");
  }
  const groups = new Set<string>();
  const textOwner = new Map<string, string>();
  let maxGroupNo = 0;
  for (const entry of record.entries) {
    validateEntryShape(entry);
    const group = entry.equivalence_group;
    if (!EQUIVALENCE_GROUP_PATTERN.test(group)) {
      throw registryInvalid(`${group} 组号词形非法（须 EQG-n）`);
    }
    if (groups.has(group)) {
      throw registryInvalid(`组号重复登记：${group}（表内唯一）`);
    }
    groups.add(group);
    const no = Number(group.slice(4));
    if (Number.isInteger(no) && no > maxGroupNo) maxGroupNo = no;
    for (const form of entry.word_forms) {
      const owner = textOwner.get(form.text);
      if (owner !== undefined) {
        throw registryInvalid(
          `词形 text 全域唯一被破坏：「${form.text}」同时属于 ${owner} 与 ${group}（解析确定性不变式；alias 三重查重同源纪律）`,
        );
      }
      textOwner.set(form.text, group);
    }
  }
  if (record.group_seq < maxGroupNo) {
    throw registryInvalid(
      `group_seq=${record.group_seq} 小于在册最大组号 ${maxGroupNo}（EQG-n 单调分配永不复用；回卷=手改痕迹）`,
    );
  }
  return record;
}

function registryInvalid(message: string): GovernanceError {
  return new GovernanceError(
    "SCHEMA_INVALID",
    `state/equivalence-registry.json ${message}`,
    "恢复 git 版本；等价登记表由 kernel equivalence.ts 语义入口维护，禁止手改",
    {},
  );
}

/** 逐条目结构校验（装载面；word_form 域/声明位条件式/active 形态封条）。 */
function validateEntryShape(entry: unknown): void {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw registryInvalid("存在非对象条目");
  }
  const e = entry as EquivalenceEntry;
  if (typeof e.equivalence_group !== "string") {
    throw registryInvalid("equivalence_group 缺失或非字符串");
  }
  if (!Array.isArray(e.word_forms) || e.word_forms.length === 0) {
    throw registryInvalid(`${e.equivalence_group} word_forms 缺失或为空（minItems 1）`);
  }
  const seen = new Set<string>();
  for (const form of e.word_forms) {
    if (
      form === null ||
      typeof form !== "object" ||
      typeof form.text !== "string" ||
      form.text.length === 0
    ) {
      throw registryInvalid(`${e.equivalence_group} 存在缺 text/空 text 的词形`);
    }
    if (!WORD_FORM_DOMAIN_VALUES.includes(form.domain)) {
      throw registryInvalid(
        `${e.equivalence_group} 词形「${form.text}」domain 词表外（${WORD_FORM_DOMAIN_VALUES.join(" | ")}）`,
      );
    }
    if (typeof form.source_ref !== "string" || form.source_ref.length === 0) {
      throw registryInvalid(
        `${e.equivalence_group} 词形「${form.text}」source_ref 缺失（登记出处锚必填）`,
      );
    }
    if (seen.has(form.text)) {
      throw registryInvalid(
        `${e.equivalence_group} 条目内词形 text 重复：「${form.text}」（互等价组是集合不是流水）`,
      );
    }
    seen.add(form.text);
  }
  if (!EQUIVALENCE_STATUS_VALUES.includes(e.status)) {
    throw registryInvalid(
      `${e.equivalence_group} status 词表外（${EQUIVALENCE_STATUS_VALUES.join(" | ")}）`,
    );
  }
  if (!isAuditOrNull(e.declared_by)) {
    throw registryInvalid(`${e.equivalence_group} declared_by 形态非法`);
  }
  if (
    e.declaration_ref !== null &&
    (typeof e.declaration_ref !== "string" || e.declaration_ref.length === 0)
  ) {
    throw registryInvalid(`${e.equivalence_group} declaration_ref 形态非法`);
  }
  if (
    e.provenance === null ||
    typeof e.provenance !== "object" ||
    !Number.isInteger(e.provenance.recorded_at_seq) ||
    e.provenance.recorded_at_seq < 0 ||
    (e.provenance.declared_at_seq !== null &&
      (!Number.isInteger(e.provenance.declared_at_seq) ||
        e.provenance.declared_at_seq < 0))
  ) {
    throw registryInvalid(
      `${e.equivalence_group} provenance 非法（recorded_at_seq/declared_at_seq 须为非负整数事件拍，A4 禁墙钟）`,
    );
  }
  if (e.note !== null && (typeof e.note !== "string" || e.note.length === 0)) {
    throw registryInvalid(`${e.equivalence_group} note 形态非法`);
  }
  if (e.status === "active") {
    if (e.declared_by === null) {
      throw registryInvalid(
        `${e.equivalence_group} status=active 但缺 declared_by（declared-equivalence-only：active 必有显式声明者）`,
      );
    }
    if (e.declaration_ref === null) {
      throw registryInvalid(
        `${e.equivalence_group} status=active 但缺 declaration_ref（声明出处锚必填）`,
      );
    }
    if (e.provenance.declared_at_seq === null) {
      throw registryInvalid(
        `${e.equivalence_group} status=active 但缺 declared_at_seq（声明事件拍必填）`,
      );
    }
    if (e.word_forms.length < 2) {
      throw registryInvalid(
        `${e.equivalence_group} active 词形少于 2（互等价组至少两个词形）`,
      );
    }
    const canonicalMembers = e.word_forms.filter(
      (form) => form.domain === "canonical",
    );
    if (canonicalMembers.length !== 1) {
      throw registryInvalid(
        `${e.equivalence_group} active 须恰含一个 canonical 位词形（联结产物位；实际 ${canonicalMembers.length}）`,
      );
    }
    try {
      parseGovernedId(canonicalMembers[0]?.text ?? "");
    } catch (error) {
      if (error instanceof GovernedIdParseError) {
        throw registryInvalid(
          `${e.equivalence_group} canonical 位词形「${canonicalMembers[0]?.text}」不过 governed id 文法（${error.message}）`,
        );
      }
      throw error;
    }
  }
  if (e.status === "pending") {
    if (e.declared_by !== null || e.declaration_ref !== null) {
      throw registryInvalid(
        `${e.equivalence_group} status=pending 但携带声明位（机械入册写不出声明——「登记≠裁决」形态面）`,
      );
    }
  }
}

function isAuditOrNull(value: unknown): value is EquivalenceDeclarationAudit | null {
  if (value === null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const audit = value as EquivalenceDeclarationAudit;
  return (
    typeof audit.actor_type === "string" &&
    ["agent", "human", "tool", "kernel"].includes(audit.actor_type) &&
    typeof audit.actor === "string" &&
    audit.actor.length > 0 &&
    typeof audit.self_attested === "boolean"
  );
}

// ============================================================
// 纯函数解析面（declared-equivalence-only；禁子串/启发式/模糊匹配）
// ============================================================

/** unresolved 出口的显式路标（禁猜测纪律注记，resolveWordForm/resolveLinkageWordForm 共用）。 */
const UNRESOLVED_NOTE =
  "未命中 active 等价登记——显式 unresolved（declared-equivalence-only：禁子串/启发式/模糊猜测，FE↔frontend、MIDU↔密度 未登记等价不猜测）；如需联结请显式声明等价（registerEquivalence 携带 declaredBy）或落 pending 裁决队列（recordPendingEquivalence）";

/**
 * 词形 → canonical（纯函数；只走 active 登记精确匹配）。查询文本 trim 后与登记
 * 词形全等比较（登记侧已 trim；零大小写/子串/模糊归一——未命中=显式 unresolved，
 * 禁猜测）。pending 条目永不命中（禁假绿）。
 */
export function resolveWordForm(
  registry: EquivalenceRegistryFile,
  text: string,
): WordFormResolution {
  const query = typeof text === "string" ? text.trim() : "";
  if (query.length === 0) {
    return {
      input: text,
      status: "unresolved",
      via: null,
      canonical: null,
      group: null,
      note: "空输入无法联结（显式 unresolved，禁猜测）",
    };
  }
  for (const entry of registry.entries) {
    if (entry.status !== "active") continue;
    const hit = entry.word_forms.find((form) => form.text === query);
    if (hit === undefined) continue;
    const canonicalMember = entry.word_forms.find(
      (form) => form.domain === "canonical",
    );
    if (canonicalMember === undefined) {
      // 装载面保证 active 恰一 canonical 位；直灌未校验文件时显式 unresolved 不猜测。
      return {
        input: query,
        status: "unresolved",
        via: null,
        canonical: null,
        group: null,
        note: `${entry.equivalence_group} active 组缺 canonical 位（装载面校验缺席；拒绝猜测）`,
      };
    }
    return {
      input: query,
      status: "resolved",
      via: "equivalence_active",
      canonical: canonicalMember.text,
      group: entry.equivalence_group,
      note: null,
    };
  }
  return {
    input: query,
    status: "unresolved",
    via: null,
    canonical: null,
    group: null,
    note: UNRESOLVED_NOTE,
  };
}

/** 反向查找结果（canonical → 等价词形；与 inverseLegacyForms 考古方向同构）。 */
export interface EquivalenceReverseLookup {
  readonly canonical: string;
  /** 命中的 active 等价组号；未命中 null。 */
  readonly group: string | null;
  /** 非 canonical 位成员词形（排除 canonical 位自身）。 */
  readonly wordForms: readonly EquivalenceWordForm[];
}

/**
 * canonical governed id → 等价词形（纯函数；A6 双向链考古方向在词形轴的镜像）。
 * canonicalId 须过 parseGovernedId（FATAL 同 parseGovernedId 契约）。只读 active。
 */
export function wordFormsFor(
  registry: EquivalenceRegistryFile,
  canonicalId: string,
): EquivalenceReverseLookup {
  parseGovernedId(canonicalId);
  for (const entry of registry.entries) {
    if (entry.status !== "active") continue;
    const hit = entry.word_forms.find(
      (form) => form.domain === "canonical" && form.text === canonicalId,
    );
    if (hit === undefined) continue;
    return {
      canonical: canonicalId,
      group: entry.equivalence_group,
      wordForms: entry.word_forms.filter((form) => form.domain !== "canonical"),
    };
  }
  return { canonical: canonicalId, group: null, wordForms: [] };
}

// ============================================================
// 联结键解析三腿链（D15/A6 挂接；先精确 id → active 等价 → pending 桶）
// ============================================================

/**
 * 联结键解析三腿链·纯读半边（P31 第二件抽出的单一实现：resolveLinkageWordForm 与
 * 跨对象引用完整性 gate ref-integrity.ts 消费同一条腿链——「同一函数，不两套」纪律）：
 * ①精确 governed id（parseGovernedId 全过 = 词形即 id，A5 closed-world；存在性归消费
 *   gate 的 REF 判卷——本面只解析命名）→ ②A6 机械别名族 canonical 化（ALIASES_V0 是
 *   词汇表 PR 已声明的等价；canonical 仍过 parseGovernedId 验证；resolveAlias 本体
 *   零改动）→ ③等价表 active 登记精确匹配（resolveWordForm 同源）。
 * 未命中：显式 unresolved（pending 恒 null——本函数纯读零写盘，机械入册归
 * resolveLinkageWordForm 腿④ / runRefIntegrityGate 批量面）。禁子串/启发式/模糊匹配。
 */
export function resolveLinkageReadOnly(
  registry: EquivalenceRegistryFile,
  text: string,
): LinkageResolution {
  const query = typeof text === "string" ? text.trim() : "";
  if (query.length === 0) {
    return {
      input: text,
      status: "unresolved",
      via: null,
      canonical: null,
      group: null,
      aliasRule: null,
      unresolved: true,
      pending: null,
      note: "空输入无法联结（显式 unresolved，禁猜测）",
    };
  }
  // 腿①：精确 governed id（词形即 id；A5 closed-world）。
  try {
    parseGovernedId(query);
    return {
      input: query,
      status: "resolved",
      via: "exact_id",
      canonical: query,
      group: null,
      aliasRule: null,
      unresolved: false,
      pending: null,
      note: null,
    };
  } catch (error) {
    if (!(error instanceof GovernedIdParseError)) throw error;
    // 非 governed id 词形：继续腿②。
  }
  // 腿②：A6 机械别名族 canonical 化（declared 面既有等价；canonical 仍过文法验证）。
  const alias = resolveAlias(query);
  if (
    alias.matchedRuleLegacy !== null &&
    alias.canonical !== null &&
    alias.canonical !== query
  ) {
    try {
      parseGovernedId(alias.canonical);
      return {
        input: query,
        status: "resolved",
        via: "exact_id_via_alias",
        canonical: alias.canonical,
        group: null,
        aliasRule: alias.matchedRuleLegacy,
        unresolved: false,
        pending: null,
        note: null,
      };
    } catch (error) {
      if (!(error instanceof GovernedIdParseError)) throw error;
      // canonical 不过文法（resolveAlias 契约外形态）：显式不冒充解析成功。
    }
  }
  // 腿③：等价表 active 登记精确匹配。
  const resolved = resolveWordForm(registry, query);
  if (resolved.status === "resolved") {
    return {
      input: query,
      status: "resolved",
      via: "equivalence_active",
      canonical: resolved.canonical,
      group: resolved.group,
      aliasRule: null,
      unresolved: false,
      pending: null,
      note: null,
    };
  }
  // 未命中（腿④归调用方）：显式 unresolved，零写盘。
  return {
    input: query,
    status: "unresolved",
    via: null,
    canonical: null,
    group: null,
    aliasRule: null,
    unresolved: true,
    pending: null,
    note: UNRESOLVED_NOTE,
  };
}

/**
 * 联结键解析三腿链（对象引用字段 field ref / contract ref 的联结键解析唯一入口）：
 * ①精确 id：parseGovernedId 全过 = 精确 governed id 引用（A5 closed-world 下词形即
 *   id；存在性归消费 gate 的 REF 判卷——本面只解析命名）；
 * ②未命中走 A6 机械别名族（ALIASES_V0 是词汇表 PR 声明过的等价——declared 面既有
 *   事实）canonical 化后再过 parseGovernedId 验证；resolveAlias 本体零改动；
 * ③未命中走等价表 active 登记精确匹配（resolveWordForm 同源）；
 * ④仍未命中：显式 unresolved + pending 桶机械入册（dedupe——同词形对已在队 noop、
 *   既有候选扩员 extended、全新候选 created），绝不静默。
 */
export async function resolveLinkageWordForm(
  store: Store,
  input: LinkageResolveInput,
): Promise<LinkageResolution> {
  const query = typeof input.text === "string" ? input.text.trim() : "";
  if (query.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "联结键词形为空（空引用无从联结）",
      "给出对象引用字段的非空词形；空槽位是上游产出缺陷，不属解析面",
      {},
    );
  }
  if (!(input.encounterRef ?? "").trim()) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "encounterRef 为空（encounter 出处锚必填——登记出处锚纪律）",
      "给出本次 encounter 的出处锚（gaps §3 行锚 / GRN 证据引用 / 调用方定位）",
      {},
    );
  }
  // 腿①②③：纯读半边（单一实现，ref-integrity gate 同源消费）。
  const resolution = resolveLinkageReadOnly(
    readEquivalenceRegistry(pathsOf(store)),
    query,
  );
  if (resolution.status === "resolved") {
    return resolution;
  }
  // 腿④：未登记词形——机械入册 pending 桶（dedupe）+ 引用显式 unresolved。
  const outcome = await recordPendingEquivalence(store, {
    wordForms: [
      { text: query, domain: "unknown", sourceRef: input.encounterRef.trim() },
      ...(input.candidates ?? []),
    ],
    note: input.note,
  });
  return {
    input: query,
    status: "unresolved",
    via: null,
    canonical: null,
    group: null,
    aliasRule: null,
    unresolved: true,
    pending: {
      registered: outcome.registered,
      group:
        outcome.mode === "noop" ? outcome.existingGroup : (outcome.entry?.equivalence_group ?? null),
    },
    note: UNRESOLVED_NOTE,
  };
}

// ============================================================
// 写通路（语义入口在本文件，落盘点唯一；staged write + journal 事件流）
// ============================================================

/**
 * 登记等价（declared-equivalence-only 闸）：
 * - 携带 declaredBy ⇒ active：declarationRef 必填（声明出处锚）；形态封条（≥2 词形 +
 *   恰一 canonical 位 + canonical 过 governed id 文法）；与任何 active 条目词形重叠
 *   = SCHEMA_INVALID（冲突显式，禁静默合并）；与 pending 条目词形重叠 ⇒ 机械清理
 *   重叠候选（裁决消费队列——同词形集 pending 候选被声明收编即处置，journal
 *   disposed_groups 留痕）；同词形集 active 重复登记 = SCHEMA_INVALID（显式重复是
 *   调用方缺陷，不静默覆盖）。
 * - 无 declaredBy ⇒ pending：声明位恒空（登记≠裁决）；同词形集重复 = SCHEMA_INVALID
 *   （机械 encounter 的 dedupe 语义走 recordPendingEquivalence）。
 */
export async function registerEquivalence(
  store: Store,
  input: EquivalenceRegistrationInput,
): Promise<EquivalenceEntry> {
  const paths = pathsOf(store);
  const currentSeq = readCurrentSeq(paths);
  if (currentSeq === null) {
    throw notConfigured(store);
  }
  const forms = normalizeWordForms(input.wordForms);
  const registry = readEquivalenceRegistry(paths);
  const isDeclared = input.declaredBy !== undefined;
  if (isDeclared) {
    const declarationRef = requireNonEmpty(
      input.declarationRef,
      "declarationRef",
      "声明出处锚必填（active 等价必须留痕谁/哪份决议声明——登记≠裁决，等价由 Authority 显式声明）",
    );
    assertActiveShape(forms);
    const inputTexts = forms.map((form) => form.text);
    const overlapping = registry.entries.filter((entry) =>
      entry.word_forms.some((form) => inputTexts.includes(form.text)),
    );
    const exactActive = overlapping.find(
      (entry) => entry.status === "active" && sameTextSet(entry.word_forms, forms),
    );
    if (exactActive !== undefined) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `等价组已在册：${exactActive.equivalence_group}（同词形集 active 重复登记是调用方缺陷）`,
        "重复申报显式拒绝不静默覆盖；既有 active 被推翻走词汇表/Authority 撤销流程，换词形集请用新组登记",
        { group: exactActive.equivalence_group },
      );
    }
    const activeConflicts = overlapping.filter(
      (entry) => entry.status === "active",
    );
    if (activeConflicts.length > 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `声明词形与在册 active 组重叠：${activeConflicts.map((entry) => entry.equivalence_group).join(" / ")}`,
        "词形 text 全域唯一（text→唯一 active 解析）；重叠声明须先推翻既有 active（走词汇表/Authority 撤销流程），禁静默合并",
        { groups: activeConflicts.map((entry) => entry.equivalence_group) },
      );
    }
    const disposedGroups = overlapping.map((entry) => entry.equivalence_group);
    const group = allocateGroup(registry);
    const entry: EquivalenceEntry = {
      equivalence_group: group,
      word_forms: forms,
      status: "active",
      declared_by: auditOf(input.declaredBy),
      declaration_ref: declarationRef,
      provenance: { recorded_at_seq: currentSeq, declared_at_seq: currentSeq },
      note: normalizeNote(input.note),
    };
    writeRegistryAndJournal(
      paths,
      {
        version: 1,
        group_seq: registry.group_seq + 1,
        entries: [
          ...registry.entries.filter(
            (candidate) => !disposedGroups.includes(candidate.equivalence_group),
          ),
          entry,
        ],
      },
      {
        type: "EQUIVALENCE_DECLARED",
        seq: currentSeq,
        equivalence_group: entry.equivalence_group,
        texts: inputTexts,
        declared_by: entry.declared_by,
        declaration_ref: entry.declaration_ref,
        disposed_groups: disposedGroups,
        note: entry.note,
      },
    );
    return entry;
  }
  // 未获声明 → pending（declared-equivalence-only：结构性写不出 active）。
  if (input.declarationRef !== undefined && input.declarationRef.trim().length > 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "无 declaredBy 却携带 declarationRef（声明引用无声明者——登记≠裁决形态面）",
      "机械入册/候选登记不携带声明位；显式声明请同时给 declaredBy + declarationRef",
      {},
    );
  }
  const inputTexts = forms.map((form) => form.text);
  const conflicting = registry.entries.find((entry) =>
    entry.word_forms.some((form) => inputTexts.includes(form.text)),
  );
  if (conflicting !== undefined) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `词形已在册：${conflicting.equivalence_group}（词形 text 全域唯一）`,
      "显式重复登记是调用方缺陷；机械 encounter 的 dedupe 走 recordPendingEquivalence（noop/extended 语义）",
      { group: conflicting.equivalence_group },
    );
  }
  const group = allocateGroup(registry);
  const entry: EquivalenceEntry = {
    equivalence_group: group,
    word_forms: forms,
    status: "pending",
    declared_by: null,
    declaration_ref: null,
    provenance: { recorded_at_seq: currentSeq, declared_at_seq: null },
    note: normalizeNote(input.note),
  };
  writeRegistryAndJournal(
    paths,
    {
      version: 1,
      group_seq: registry.group_seq + 1,
      entries: [...registry.entries, entry],
    },
    {
      type: "EQUIVALENCE_PENDING_RECORDED",
      seq: currentSeq,
      equivalence_group: entry.equivalence_group,
      texts: inputTexts,
      recorded_by: null,
      note: entry.note,
    },
  );
  return entry;
}

/**
 * pending 桶机械入册面（encounter 自动入册的共用入口；dedupe 三态）：
 * - 同词形集已在队 → noop（registered=false + existingGroup——encounter 重复是常态
 *   不是缺陷，与显式登记面的 SCHEMA_INVALID 有意区分）；
 * - 词形已属某 pending 候选（部分重叠）→ extended（既有候选扩员：新候选词形并入
 *   同一队列条目，Authority 看到同一词形的全部候选配对）；
 * - 全新词形 → created（EQG-n 单调分配）；
 * - 词形已属 active 组 → SCHEMA_INVALID（active 词形已可解析，入队无意义=调用方缺陷）；
 * - 词形跨多个既有条目 → SCHEMA_INVALID（跨条目配对=调用方缺陷，禁静默合并）。
 */
export async function recordPendingEquivalence(
  store: Store,
  input: PendingRecordInput,
): Promise<PendingRecordOutcome> {
  const paths = pathsOf(store);
  const currentSeq = readCurrentSeq(paths);
  if (currentSeq === null) {
    throw notConfigured(store);
  }
  const forms = normalizeWordForms(input.wordForms);
  const registry = readEquivalenceRegistry(paths);
  const recordedBy = input.recordedBy
    ? auditOf(input.recordedBy)
    : ({ actor_type: "kernel", actor: "pomaster-kernel", self_attested: true } as const);
  const inputTexts = forms.map((form) => form.text);
  const owners = [
    ...new Set(
      registry.entries
        .filter((entry) =>
          entry.word_forms.some((form) => inputTexts.includes(form.text)),
        )
        .map((entry) => entry.equivalence_group),
    ),
  ];
  if (owners.length > 1) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `词形跨既有条目：${owners.join(" / ")}`,
      "跨条目配对是调用方缺陷（一次 encounter 只产出一个候选组）；词形 text 全域唯一不变式禁止静默合并",
      { groups: owners },
    );
  }
  const owner =
    owners.length === 1
      ? registry.entries.find(
          (entry) => entry.equivalence_group === owners[0],
        )
      : undefined;
  if (owner !== undefined) {
    if (owner.status === "active") {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `词形已在 active 组 ${owner.equivalence_group}（已可解析，入 pending 队无意义）`,
        "active 词形不再进裁决队列；本调用是调用方缺陷（解析链只在全腿未命中时入册）",
        { group: owner.equivalence_group },
      );
    }
    const newForms = forms.filter(
      (form) => !owner.word_forms.some((existing) => existing.text === form.text),
    );
    if (newForms.length === 0) {
      return {
        registered: false,
        mode: "noop",
        entry: null,
        existingGroup: owner.equivalence_group,
      };
    }
    const extended: EquivalenceEntry = {
      ...owner,
      word_forms: [...owner.word_forms, ...newForms],
      note: input.note?.trim() ? input.note.trim() : owner.note,
    };
    writeRegistryAndJournal(
      paths,
      {
        version: 1,
        group_seq: registry.group_seq,
        entries: registry.entries.map((entry) =>
          entry.equivalence_group === owner.equivalence_group ? extended : entry,
        ),
      },
      {
        type: "EQUIVALENCE_PENDING_EXTENDED",
        seq: currentSeq,
        equivalence_group: extended.equivalence_group,
        added_texts: newForms.map((form) => form.text),
        recorded_by: recordedBy,
        note: extended.note,
      },
    );
    return {
      registered: true,
      mode: "extended",
      entry: extended,
      existingGroup: owner.equivalence_group,
    };
  }
  const group = allocateGroup(registry);
  const entry: EquivalenceEntry = {
    equivalence_group: group,
    word_forms: forms,
    status: "pending",
    declared_by: null,
    declaration_ref: null,
    provenance: { recorded_at_seq: currentSeq, declared_at_seq: null },
    note: normalizeNote(input.note),
  };
  writeRegistryAndJournal(
    paths,
    {
      version: 1,
      group_seq: registry.group_seq + 1,
      entries: [...registry.entries, entry],
    },
    {
      type: "EQUIVALENCE_PENDING_RECORDED",
      seq: currentSeq,
      equivalence_group: entry.equivalence_group,
      texts: inputTexts,
      recorded_by: recordedBy,
      note: entry.note,
    },
  );
  return { registered: true, mode: "created", entry, existingGroup: null };
}

/**
 * 联结覆盖率盲区指标（纯函数；分母封闭 resolved+pending+unresolved=total）。
 * 词表外 outcome 一律 SCHEMA_INVALID（fail-closed，禁静默归桶）。
 */
export function computeLinkageCoverage(
  attempts: readonly LinkageAttempt[],
): LinkageCoverage {
  let resolved = 0;
  let pending = 0;
  let unresolved = 0;
  for (const attempt of attempts) {
    switch (attempt.outcome) {
      case "resolved_exact_id":
      case "resolved_exact_id_via_alias":
      case "resolved_equivalence_active":
        resolved += 1;
        break;
      case "pending_registered":
        pending += 1;
        break;
      case "unresolved_blindspot":
        unresolved += 1;
        break;
      default:
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `联结尝试 outcome 词形非法：${String(attempt.outcome)}`,
          `合法词形：resolved_exact_id / resolved_exact_id_via_alias / resolved_equivalence_active / pending_registered / unresolved_blindspot`,
          { input: attempt.input },
        );
    }
  }
  const total = attempts.length;
  return {
    total,
    resolved,
    pending,
    unresolved,
    coverageRatio: total > 0 ? resolved / total : 0,
    zeroDenominator: total === 0,
    uncheckedInBlindspotEstimated: unresolved,
  };
}

// ============================================================
// 内部共享（normalize/allocate/audit + 唯一落盘点）
// ============================================================

/** 词形输入归一（trim + 域词表闸 + 出处锚必填 + 条目内 text 去重=拒绝）。 */
function normalizeWordForms(
  inputs: readonly EquivalenceWordFormInput[],
): readonly EquivalenceWordForm[] {
  const normalized: EquivalenceWordForm[] = [];
  const seen = new Set<string>();
  for (const input of inputs ?? []) {
    const text = (input?.text ?? "").trim();
    if (text.length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        "词形 text 为空（空串不是词形）",
        "给出非空词形原文（登记侧仅 trim 归一空白边缘，零其他归一）",
        {},
      );
    }
    if (seen.has(text)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `同一登记内词形 text 重复：「${text}」（互等价组是集合不是流水）`,
        "去重后登记；同词形重复出现是调用方缺陷",
        { text },
      );
    }
    seen.add(text);
    const sourceRef = (input?.sourceRef ?? "").trim();
    if (sourceRef.length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `词形「${text}」缺 sourceRef（登记出处锚必填——每条裁定注记出处锚纪律）`,
        "给出该词形的出处锚（gaps §3 行锚 / PRD §号 / GRN 证据引用 / 词汇表 PR 引用）",
        { text },
      );
    }
    normalized.push({
      text,
      domain: normalizeWordFormDomain(input?.domain ?? ""),
      source_ref: sourceRef,
    });
  }
  if (normalized.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "等价登记缺词形（word_forms minItems 1；active minItems 2）",
      "至少给出一组词形（互等价组）",
      {},
    );
  }
  return normalized;
}

/** active 形态封条（≥2 词形 + 恰一 canonical 位 + canonical 过 governed id 文法）。 */
function assertActiveShape(
  forms: readonly EquivalenceWordForm[],
): void {
  if (forms.length < 2) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `active 等价组词形少于 2（实际 ${forms.length}；互等价组至少两个词形）`,
      "等价是至少两个词形间的关系；单词形登记请走 pending encounter（recordPendingEquivalence）",
      {},
    );
  }
  const canonicalMembers = forms.filter((form) => form.domain === "canonical");
  if (canonicalMembers.length !== 1) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `active 须恰含一个 canonical 位词形（实际 ${canonicalMembers.length}；联结产物位）`,
      "等价组须含一个 governed id 词形（domain=canonical，文本过 governed id 文法）作为解析产物位",
      {},
    );
  }
  const canonicalText = canonicalMembers[0]?.text ?? "";
  try {
    parseGovernedId(canonicalText);
  } catch (error) {
    if (error instanceof GovernedIdParseError) {
      throw new GovernanceError(
        governanceCodeForParseError(error),
        `canonical 位词形「${canonicalText}」不过 governed id 文法：${error.message}`,
        "canonical 位须为 PREFIX.SEGMENT(.SEGMENT)*[.SEQ] canonical governed id（A5 closed-world）",
        { text: canonicalText },
      );
    }
    throw error;
  }
}

/** EQG-n 单调分配（group_seq+1；永不复用，A4）。 */
function allocateGroup(registry: EquivalenceRegistryFile): string {
  return `EQG-${registry.group_seq + 1}`;
}

function sameTextSet(
  a: readonly EquivalenceWordForm[],
  b: readonly EquivalenceWordForm[],
): boolean {
  const keys = (forms: readonly EquivalenceWordForm[]) =>
    forms.map((form) => form.text).sort();
  const ka = keys(a);
  const kb = keys(b);
  return ka.length === kb.length && ka.every((text, index) => text === kb[index]);
}

function auditOf(actor: Actor): EquivalenceDeclarationAudit {
  return {
    actor_type: actor.actorType,
    actor: actor.actor,
    self_attested: actor.selfAttested,
  };
}

function normalizeNote(note: string | undefined | null): string | null {
  return note && note.trim() ? note.trim() : null;
}

function requireNonEmpty(
  value: string | undefined,
  field: string,
  why: string,
): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${field} 为空（${why}）`,
      why,
      { [field]: value ?? null },
    );
  }
  return trimmed;
}

function notConfigured(store: Store): GovernanceError {
  return new GovernanceError(
    "NOT_CONFIGURED",
    "store 未初始化（state/truth-index.json 缺失）",
    "先跑 createStore(rootDir) 完成骨架初始化（No-op is elegant）",
    { rootDir: store.rootDir },
  );
}

/**
 * 唯一落盘点（registry staged write + journal 追加，模式同 knowledge.writeLibraryAndJournal）：
 * executeWrites 两写一事务，任一步失败回滚到事务前（captureOriginal 字节恢复），
 * 不落半写状态。
 */
function writeRegistryAndJournal(
  paths: StorePaths,
  nextFile: EquivalenceRegistryFile,
  event: Record<string, unknown>,
): void {
  const journalLine = `${JSON.stringify(event)}\n`;
  executeWrites([
    {
      path: paths.equivalenceRegistryPath,
      next: `${JSON.stringify(nextFile, null, 2)}\n`,
      original: captureOriginal(paths.equivalenceRegistryPath),
    },
    {
      path: paths.journalPath,
      next: `${readText(paths.journalPath) ?? ""}${journalLine}`,
      original: captureOriginal(paths.journalPath),
    },
  ]);
}
