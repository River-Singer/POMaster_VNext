/**
 * family.ts —— Object Family 派生视图（P-v06 批次 0 Model Constitution；
 * PRD v0.6 §6.1 十二 Object Family + §1.2 Derived Facts Must Be Derived +
 * §163 Phase A「增加 family / subtype / relation / profile」的零信封落法）。
 *
 * 出处锚：
 * - PRD v0.6 §6.1：十二族逐字（PRODUCT/UI/INTERFACE/CODE/DATA/RUNTIME/RESOURCE/
 *   RELIABILITY/SECURITY/DELIVERY/GOVERNANCE/EVIDENCE）。
 * - PRD v0.6 §1.2：机器可派生事实不要求人类维护——family 由 governed 前缀映射
 *   **派生**（本模块），零信封改动、零索引行改动（01 additionalProperties:false
 *   封条不动），展示位归 inspect/projection 派生面。
 * - PRD v0.6 §163 Phase C：新 family 待真实对象出现走词汇表 PR 增前缀——本模块
 *   不发明前缀、不扩 OBJECT_FAMILY_VALUES（该轴 vocab-lock@v0.5-resolved
 *   software_graph_vocab.object_family，PR-0006 收编；本文件不发明词值）。
 *
 * 纪律：映射必须对 GOVERNED_ID_PREFIXES 15 前缀**全总**（漏前缀=装载期 FATAL——
 * 新前缀入闭包而映射未跟，deriveFamily 立即红，禁静默 null）；五族暂无前缀映射
 * （RUNTIME/RESOURCE/RELIABILITY/SECURITY/DELIVERY）是**登记在案的缺席**而非漏洞
 * ——真实对象（table/service/deployment…）出现时随其前缀的词汇表 PR 同批补映射。
 */
import { parseGovernedId } from "./id.js";
import { GOVERNED_ID_PREFIXES, OBJECT_FAMILY_VALUES, type GovernedIdPrefix, type ObjectFamilyValue } from "./vocab.js";

/**
 * 前缀 → family 派生映射（全总；v0.5-resolved 时点 15 前缀）。
 * 派生锚（PRD §6.1 族语义）：PAGE/COMPONENT→UI；CAPABILITY→PRODUCT；
 * API_REQ/ERR→INTERFACE；FIELD→DATA；KEYBINDING→CODE（ID↔源码锚定面）；
 * KNOWLEDGE/CHANGE/TASK/DENOMINATOR/POLICY/PROFILE/AUTHORITY→GOVERNANCE；
 * TEST→EVIDENCE。
 */
export const PREFIX_FAMILY_MAP: Readonly<
  Record<GovernedIdPrefix, ObjectFamilyValue>
> = {
  PAGE: "UI",
  COMPONENT: "UI",
  CAPABILITY: "PRODUCT",
  API_REQ: "INTERFACE",
  ERR: "INTERFACE",
  FIELD: "DATA",
  KEYBINDING: "CODE",
  KNOWLEDGE: "GOVERNANCE",
  CHANGE: "GOVERNANCE",
  TASK: "GOVERNANCE",
  DENOMINATOR: "GOVERNANCE",
  POLICY: "GOVERNANCE",
  PROFILE: "GOVERNANCE",
  AUTHORITY: "GOVERNANCE",
  TEST: "EVIDENCE",
} as const satisfies Readonly<Record<GovernedIdPrefix, ObjectFamilyValue>>;

/** 暂无前缀映射的五族（PRD §163 Phase C 显式缺席登记——禁猜测派生）。 */
export const FAMILIES_WITHOUT_PREFIX: readonly ObjectFamilyValue[] = OBJECT_FAMILY_VALUES.filter(
  (family) => !Object.values(PREFIX_FAMILY_MAP).includes(family),
);

/**
 * 前缀 → family（纯函数；映射漏前缀 = 实现缺陷 FATAL——全总性自检的结构落点）。
 */
export function deriveFamily(prefix: GovernedIdPrefix): ObjectFamilyValue {
  const family = PREFIX_FAMILY_MAP[prefix];
  if (family === undefined) {
    throw new Error(
      `PREFIX_FAMILY_MAP 漏前缀：${prefix}（映射必须对 GOVERNED_ID_PREFIXES 全总；新前缀入闭包须同批补映射——词汇表 PR 三镜像纪律）`,
    );
  }
  return family;
}

/**
 * governed id → family（纯函数；文法归 parseGovernedId，A5 closed-world FATAL 同契约）。
 */
export function familyOfId(id: string): ObjectFamilyValue {
  return deriveFamily(parseGovernedId(id).prefix);
}

/**
 * 全总性自检（模块装载期执行一次；新前缀忘补映射立即红——禁运行期静默 null）。
 */
const unmapped = GOVERNED_ID_PREFIXES.filter(
  (prefix) => PREFIX_FAMILY_MAP[prefix] === undefined,
);
if (unmapped.length > 0) {
  throw new Error(
    `PREFIX_FAMILY_MAP 漏前缀：${unmapped.join(" / ")}（全总性自检失败——词汇表 PR 增前缀须同批补映射）`,
  );
}
