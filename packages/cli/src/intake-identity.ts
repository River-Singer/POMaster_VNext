/**
 * intake-identity.ts —— 跨修订的稳定身份与语义差异（code-spec：requirement-intake §3.4/§3.5）。
 *
 * 编号只发一次：新一版先和身份表对齐，对上的沿用旧编号，对不上的才发新号。对齐依次看材料自带标识 /
 * 归一正文锚点、字二元组相似度；模块按键对齐，键消失又出现新键时，变更文档里有改名明文或条目锚点高度
 * 重合才算改名。「缺席」不等于「删除」：删除要有依据，否则记「本次未随交付」并沿用上一版。
 */

import type { CandidateItem, ChangeEvidence } from "./intake-blocks.js";
import { anchorText, containment, similarity, textPairScore } from "./intake-text.js";

export const INTAKE_IDENTITY_SCHEMA = "pomaster.intake-identity/v1";

export type ItemStatus = "alive" | "not_delivered" | "removed" | "split" | "merged";
export type ModuleStatus = "alive" | "not_delivered" | "removed";

export interface ModuleIdentity {
  readonly key: string;
  readonly aliases: readonly string[];
  readonly title: string;
  readonly status: ModuleStatus;
  readonly first_revision: number;
  readonly last_revision: number;
  readonly renamed_from?: string;
}

export interface ItemIdentity {
  readonly kind: string;
  readonly module: string;
  readonly anchor: string;
  readonly label: string;
  readonly status: ItemStatus;
  readonly first_revision: number;
  readonly last_revision: number;
  readonly split_into?: readonly string[];
  readonly split_from?: string;
  readonly merged_into?: string;
  readonly merged_from?: readonly string[];
}

export interface IdentityTable {
  readonly schema: typeof INTAKE_IDENTITY_SCHEMA;
  readonly workspace: string;
  readonly last_revision: number;
  readonly next_module: number;
  readonly next_item: number;
  readonly modules: Readonly<Record<string, ModuleIdentity>>;
  readonly items: Readonly<Record<string, ItemIdentity>>;
}

/** 有编号的条目（修订快照里的一行）。 */
export interface IntakeItem {
  readonly id: string;
  readonly kind: string;
  readonly module: string;
  readonly module_key: string;
  readonly label: string;
  readonly text: string;
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly anchor: string;
  readonly origin: { readonly file: string; readonly revision: number; readonly block: string | null; readonly locator: string };
  readonly basis: "extracted" | "resolved";
  readonly source: string;
  /** 来自上一版、本次未随交付而沿用。 */
  readonly carried?: boolean;
}

export type ItemChange = "unchanged" | "restated" | "modified" | "added" | "removed" | "moved" | "split" | "merged" | "not_delivered" | "sample_data";
export type ModuleChange = "unchanged" | "added" | "removed" | "renamed" | "not_delivered";

export interface ItemChangeRecord {
  readonly id: string;
  readonly kind: string;
  readonly module: string;
  readonly change: ItemChange;
  readonly class: "business" | "field" | "ui" | "tech" | "sample_data" | "proposal";
  readonly basis?: string;
  readonly similarity?: number;
  readonly before?: { readonly label: string; readonly text: string; readonly module: string };
  readonly after?: { readonly label: string; readonly text: string; readonly module: string };
  readonly related?: readonly string[];
}

export interface ModuleChangeRecord {
  readonly id: string;
  readonly key: string;
  readonly change: ModuleChange;
  readonly basis?: string;
  readonly renamed_from?: string;
}

export interface RevisionChanges {
  readonly from: number;
  readonly to: number;
  readonly modules: readonly ModuleChangeRecord[];
  readonly items: readonly ItemChangeRecord[];
  readonly counts: Readonly<Record<ItemChange, number>>;
}

export function emptyIdentity(workspace: string): IdentityTable {
  return { schema: INTAKE_IDENTITY_SCHEMA, workspace, last_revision: 0, next_module: 1, next_item: 1, modules: {}, items: {} };
}

const LABEL_KINDS = new Set(["field", "enum", "operation", "tech_hint", "scenario", "module", "change_proposal", "ui_page", "ui_region", "ui_field", "ui_action", "ui_column", "ui_tab", "ui_nav", "ui_status"]);
const LABEL_THRESHOLD = 0.75;
/** 正文类条目：同一句话可能因为标题变化换了类。 */
const TEXT_KINDS = new Set(["rule", "description", "operation", "dependency", "non_goal", "open_question", "role", "seed_data"]);
const TEXT_THRESHOLD = 0.6;

function classOf(kind: string): ItemChangeRecord["class"] {
  if (kind === "field") return "field";
  if (kind === "tech_hint") return "tech";
  if (kind === "change_proposal") return "proposal";
  if (kind.startsWith("ui_")) return "ui";
  return "business";
}

type Content = { readonly text: string; readonly label: string; readonly attrs: Readonly<Record<string, unknown>> };

/** 归一后相同（只差标点、空白、全半角）就是没变。 */
function sameContent(left: Content, right: Content): boolean {
  return anchorText(left.text) === anchorText(right.text) && anchorText(left.label) === anchorText(right.label) && JSON.stringify(left.attrs) === JSON.stringify(right.attrs);
}

const INDEX_KEY = /^(#|序号|no\.?|编号|col\d+)$/i;

function cellsOf(attrs: Readonly<Record<string, unknown>>): Map<string, string> | null {
  const cells = attrs["cells"];
  if (cells === null || typeof cells !== "object" || Array.isArray(cells)) return null;
  return new Map(Object.entries(cells as Record<string, unknown>).filter(([key]) => !INDEX_KEY.test(key.trim())).map(([key, value]) => [anchorText(key), anchorText(String(value ?? ""))]));
}

/**
 * 表格行只是换了说法（加了序号列、删了一列、表头改名），共同的单元格都没变：算「仅表述变化」，
 * 不算需求修改。任何共同单元格的值变了（必填 是→否），就是修改。
 */
function restatedOnly(before: Content, after: Content): boolean {
  if (anchorText(before.label) !== anchorText(after.label)) return false;
  const left = cellsOf(before.attrs);
  const right = cellsOf(after.attrs);
  if (left === null || right === null) return false;
  const label = anchorText(after.label);
  const shared = [...left.keys()].filter((key) => right.has(key));
  if (shared.some((key) => left.get(key) !== right.get(key))) return false;
  if (shared.some((key) => left.get(key) !== label && (left.get(key) ?? "") !== "")) return true;
  const values = (cells: Map<string, string>) => JSON.stringify([...cells.values()].filter((value) => value !== "" && value !== label).sort());
  return values(left) === values(right);
}

/** 原型下拉选项过半变了、spec 又没有这个字段的枚举：示例数据变化，不是需求变化。 */
function sampleDataOnly(before: IntakeItem, after: CandidateItem, enumLabels: ReadonlySet<string>): boolean {
  if (after.kind !== "ui_field" || before.label !== after.label) return false;
  const left = before.attrs["options"];
  const right = after.attrs["options"];
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const { options: _left, ...restBefore } = before.attrs;
  const { options: _right, ...restAfter } = after.attrs;
  if (JSON.stringify(restBefore) !== JSON.stringify(restAfter)) return false;
  if (enumLabels.has(after.label)) return false;
  const kept = right.filter((value) => left.includes(value)).length;
  return left.length > 0 && kept <= Math.max(left.length, right.length) / 2;
}

interface AlignInput {
  readonly identity: IdentityTable;
  /** 上一版的条目快照（含沿用条目）；第一版为空。 */
  readonly previous: readonly IntakeItem[];
  readonly candidates: readonly CandidateItem[];
  /** 本次交付里出现的模块键 → 标题。 */
  readonly modules: ReadonlyMap<string, string>;
  readonly evidence: readonly ChangeEvidence[];
  readonly revision: number;
  /** 本次交付里出现的来源键。旧条目的来源没交付 → 沿用（本次未随交付），不判删除。 */
  readonly delivered: ReadonlySet<string>;
}

export interface AlignResult {
  readonly identity: IdentityTable;
  readonly items: readonly IntakeItem[];
  readonly changes: RevisionChanges;
}

/**
 * 对齐：给候选条目分配编号，算出模块与条目的变化。
 * 不变式：返回的 items 前 candidates.length 条与 candidates 一一按序对应，其后是沿用的旧条目。
 */
export function alignRevision(input: AlignInput): AlignResult {
  const { identity, previous, candidates, evidence, revision, delivered } = input;
  const modules: Record<string, ModuleIdentity> = { ...identity.modules };
  const itemIds: Record<string, ItemIdentity> = { ...identity.items };
  let nextModule = identity.next_module;
  let nextItem = identity.next_item;
  const mintModule = () => `MOD-${String(nextModule++).padStart(3, "0")}`;
  const mintItem = () => `REQ-${String(nextItem++).padStart(4, "0")}`;

  // —— 模块对齐 ——
  const keyToId = new Map<string, string>();
  for (const [id, module] of Object.entries(modules)) {
    if (module.status === "removed") continue;
    keyToId.set(module.key, id);
    for (const alias of module.aliases) if (!keyToId.has(alias)) keyToId.set(alias, id);
  }
  const deliveredKeys = [...input.modules.keys()];
  const moduleChanges: ModuleChangeRecord[] = [];
  const resolvedModule = new Map<string, string>();
  for (const key of deliveredKeys) {
    const id = keyToId.get(key);
    if (id !== undefined) resolvedModule.set(key, id);
  }
  const aliveBefore = Object.entries(modules).filter(([, module]) => module.status !== "removed");
  const deliveredIds = new Set(resolvedModule.values());
  let vanished = aliveBefore.filter(([id]) => !deliveredIds.has(id)).map(([id]) => id);
  let appeared = deliveredKeys.filter((key) => !resolvedModule.has(key));
  const anchorsOf = (module: string, items: ReadonlyArray<{ module: string; anchor: string }>) => new Set(items.filter((item) => item.module === module).map((item) => item.anchor));
  const renames = new Map<string, { from: string; basis: string }>();
  for (const id of [...vanished]) {
    const oldKeys = new Set([modules[id]?.key ?? "", ...(modules[id]?.aliases ?? [])]);
    const proof = evidence.find((entry) => entry.type === "rename" && entry.keys.some((key) => oldKeys.has(key)) && entry.keys.some((key) => appeared.includes(key)));
    const target = proof?.keys.find((key) => appeared.includes(key));
    if (proof !== undefined && target !== undefined) {
      renames.set(target, { from: id, basis: `变更文档 ${proof.change_id}（${proof.file}:${proof.line}）：${proof.excerpt}` });
      vanished = vanished.filter((entry) => entry !== id);
      appeared = appeared.filter((key) => key !== target);
    }
  }
  for (const id of [...vanished]) {
    const before = anchorsOf(id, previous);
    if (before.size < 3) continue;
    let best: { key: string; score: number } | null = null;
    for (const key of appeared) {
      const after = anchorsOf(key, candidates);
      const shared = [...before].filter((anchor) => after.has(anchor)).length;
      const score = shared / Math.max(1, Math.min(before.size, after.size));
      if (shared >= 3 && score >= 0.5 && (best === null || score > best.score)) best = { key, score };
    }
    if (best !== null) {
      renames.set(best.key, { from: id, basis: `条目锚点重合 ${Math.round(best.score * 100)}%` });
      vanished = vanished.filter((entry) => entry !== id);
      appeared = appeared.filter((key) => key !== best?.key);
    }
  }
  for (const [key, rename] of renames) {
    const old = modules[rename.from];
    if (old === undefined) continue;
    modules[rename.from] = { ...old, key, aliases: [...new Set([...old.aliases, old.key])], title: input.modules.get(key) ?? old.title, status: "alive", last_revision: revision, renamed_from: old.key };
    resolvedModule.set(key, rename.from);
    moduleChanges.push({ id: rename.from, key, change: "renamed", basis: rename.basis, renamed_from: old.key });
  }
  for (const key of appeared) {
    const id = mintModule();
    modules[id] = { key, aliases: [], title: input.modules.get(key) ?? key, status: "alive", first_revision: revision, last_revision: revision };
    resolvedModule.set(key, id);
    moduleChanges.push({ id, key, change: "added" });
  }
  const removedModules = new Set<string>();
  const carriedModules = new Set<string>();
  for (const id of vanished) {
    const old = modules[id];
    if (old === undefined) continue;
    const oldKeys = new Set([old.key, ...old.aliases]);
    const proof = evidence.find((entry) => entry.type === "removal" && entry.keys.some((key) => oldKeys.has(key)));
    if (proof !== undefined) {
      modules[id] = { ...old, status: "removed", last_revision: revision };
      removedModules.add(id);
      moduleChanges.push({ id, key: old.key, change: "removed", basis: `变更文档 ${proof.change_id}（${proof.file}:${proof.line}）：${proof.excerpt}` });
    } else {
      modules[id] = { ...old, status: "not_delivered" };
      carriedModules.add(id);
      moduleChanges.push({ id, key: old.key, change: "not_delivered", basis: "本次交付里没有这个模块，也没有删除依据；沿用上一版" });
    }
  }
  for (const [key, id] of resolvedModule) {
    const module = modules[id];
    if (module === undefined) continue;
    if (!renames.has(key) && module.first_revision !== revision) {
      moduleChanges.push({ id, key, change: "unchanged" });
      modules[id] = { ...module, status: "alive", last_revision: revision, title: input.modules.get(key) ?? module.title };
    }
  }

  // —— 条目对齐 ——
  // 改名的模块：它自己那份文档的旧来源键视同已交付（内容在新键下），没对上的旧条目按删除处理；
  // 挂在这个模块下的其他来源（原型页面等）照常按是否交付判断
  const effective = new Set(delivered);
  for (const rename of renames.values()) {
    const old = modules[rename.from];
    for (const key of [old?.renamed_from ?? "", ...(old?.aliases ?? [])]) if (key !== "") effective.add(`doc:${key}`);
  }

  type Pending = { candidate: CandidateItem; module: string };
  const fresh: Pending[] = candidates.map((candidate) => ({ candidate, module: resolvedModule.get(candidate.module) ?? candidate.module }));
  const matched = new Map<Pending, { item: IntakeItem; score: number }>();
  const usedPrev = new Set<IntakeItem>();
  const enumLabels = new Set(candidates.filter((item) => item.kind === "enum").map((item) => item.label));
  const groupKey = (module: string, kind: string) => `${module}\u0000${kind}`;
  const prevGroups = new Map<string, IntakeItem[]>();
  for (const item of previous) prevGroups.set(groupKey(item.module, item.kind), [...(prevGroups.get(groupKey(item.module, item.kind)) ?? []), item]);
  const freshGroups = new Map<string, Pending[]>();
  for (const entry of fresh) freshGroups.set(groupKey(entry.module, entry.candidate.kind), [...(freshGroups.get(groupKey(entry.module, entry.candidate.kind)) ?? []), entry]);
  const open = (list: readonly Pending[]) => list.filter((entry) => !matched.has(entry));
  const unused = (list: readonly IntakeItem[]) => list.filter((item) => !usedPrev.has(item));
  const pair = (entry: Pending, item: IntakeItem, score: number) => {
    matched.set(entry, { item, score });
    usedPrev.add(item);
  };

  // 1. 锚点一致（材料自带标识 / 归一正文）
  for (const [key, group] of freshGroups) {
    const byAnchor = new Map<string, IntakeItem[]>();
    for (const item of prevGroups.get(key) ?? []) byAnchor.set(item.anchor, [...(byAnchor.get(item.anchor) ?? []), item]);
    for (const entry of group) {
      const hit = unused(byAnchor.get(entry.candidate.anchor) ?? [])[0];
      if (hit !== undefined) pair(entry, hit, 1);
    }
  }
  // 2. 同一句话换了类（标题没了，「描述」变成「规则」）：同模块、正文类条目、锚点一致
  for (const entry of open(fresh)) {
    if (!TEXT_KINDS.has(entry.candidate.kind)) continue;
    const hit = unused(previous).find((item) => item.module === entry.module && TEXT_KINDS.has(item.kind) && item.kind !== entry.candidate.kind && item.anchor === entry.candidate.anchor);
    if (hit !== undefined) pair(entry, hit, 1);
  }
  // 3. 拆分 / 合并：一条旧的被两条以上新的各自包含、合起来又覆盖了旧的（或反之）；在相似度配对之前判，
  //    否则相似度会先把其中一半认成「修改」
  const splitOf = new Map<IntakeItem, Pending[]>();
  const mergeOf = new Map<Pending, IntakeItem[]>();
  const claimed = new Set<Pending>();
  for (const [key, group] of freshGroups) {
    if (group[0]?.candidate.kind.startsWith("ui_") === true) continue;
    for (const old of unused(prevGroups.get(key) ?? []).filter((item) => effective.has(item.source))) {
      const parts = open(group).filter((entry) => !claimed.has(entry) && containment(entry.candidate.text, old.text) >= 0.7);
      if (parts.length < 2 || parts.some((entry) => similarity(entry.candidate.text, old.text) >= 0.85)) continue;
      if (containment(old.text, parts.map((entry) => entry.candidate.text).join(" ")) < 0.7) continue;
      splitOf.set(old, parts);
      usedPrev.add(old);
      for (const entry of parts) claimed.add(entry);
    }
    for (const entry of open(group).filter((candidate) => !claimed.has(candidate))) {
      const sources = unused(prevGroups.get(key) ?? []).filter((old) => effective.has(old.source) && containment(old.text, entry.candidate.text) >= 0.7);
      if (sources.length < 2 || sources.some((old) => similarity(entry.candidate.text, old.text) >= 0.85)) continue;
      if (containment(entry.candidate.text, sources.map((old) => old.text).join(" ")) < 0.7) continue;
      mergeOf.set(entry, sources);
      claimed.add(entry);
      for (const old of sources) usedPrev.add(old);
    }
  }
  // 4. 相似度配对（同模块同类，贪心一对一）
  for (const [key, group] of freshGroups) {
    const kind = group[0]?.candidate.kind ?? "";
    const threshold = LABEL_KINDS.has(kind) && !kind.startsWith("ui_") ? LABEL_THRESHOLD : TEXT_THRESHOLD;
    const pairs: Array<{ entry: Pending; item: IntakeItem; score: number }> = [];
    for (const entry of open(group).filter((candidate) => !claimed.has(candidate))) {
      for (const item of unused(prevGroups.get(key) ?? [])) {
        // 原型事实带上下文比（两个弹窗里都有「状态」不是同一个字段）；需求条目的标签类按标签比
        const score = kind.startsWith("ui_") ? similarity(entry.candidate.text, item.text) : LABEL_KINDS.has(kind) ? similarity(entry.candidate.label, item.label) : textPairScore(entry.candidate.text, item.text);
        if (score >= threshold) pairs.push({ entry, item, score });
      }
    }
    pairs.sort((left, right) => right.score - left.score);
    for (const candidate of pairs) if (!matched.has(candidate.entry) && !usedPrev.has(candidate.item)) pair(candidate.entry, candidate.item, candidate.score);
  }
  // 5. 跨模块移动：同类、锚点相同、两边都没对上，且这个锚点在新旧两版里都只出现在一个模块
  //    （「导入」「更新人」这类各模块都有的通用条目不判移动，否则一个模块删、另一个模块加就被误连成一条）
  const moduleSpread = (list: ReadonlyArray<{ kind: string; anchor: string; module: string }>) => {
    const spread = new Map<string, Set<string>>();
    for (const item of list) {
      const key = `${item.kind}\u0000${item.anchor}`;
      spread.set(key, (spread.get(key) ?? new Set<string>()).add(item.module));
    }
    return spread;
  };
  const spreadBefore = moduleSpread(previous);
  const spreadAfter = moduleSpread(fresh.map((entry) => ({ kind: entry.candidate.kind, anchor: entry.candidate.anchor, module: entry.module })));
  const unique = (kind: string, anchor: string) => (spreadBefore.get(`${kind}\u0000${anchor}`)?.size ?? 0) === 1 && (spreadAfter.get(`${kind}\u0000${anchor}`)?.size ?? 0) === 1;
  const moved = new Map<Pending, IntakeItem>();
  for (const entry of open(fresh)) {
    if (claimed.has(entry) || !unique(entry.candidate.kind, entry.candidate.anchor)) continue;
    const hit = unused(previous).find((item) => item.kind === entry.candidate.kind && item.module !== entry.module && item.anchor === entry.candidate.anchor && effective.has(item.source));
    if (hit !== undefined) {
      moved.set(entry, hit);
      usedPrev.add(hit);
    }
  }

  const items: IntakeItem[] = [];
  const changes: ItemChangeRecord[] = [];
  const toItem = (id: string, entry: Pending): IntakeItem => ({
    id,
    kind: entry.candidate.kind,
    module: entry.module,
    module_key: entry.candidate.module,
    label: entry.candidate.label,
    text: entry.candidate.text,
    attrs: entry.candidate.attrs,
    anchor: entry.candidate.anchor,
    origin: { ...entry.candidate.origin, revision },
    basis: entry.candidate.basis,
    source: entry.candidate.source,
  });
  const view = (item: { label: string; text: string; module: string }) => ({ label: item.label, text: item.text.slice(0, 300), module: item.module });
  for (const entry of fresh) {
    const hit = matched.get(entry);
    const movedFrom = moved.get(entry);
    if (hit !== undefined) {
      const item = toItem(hit.item.id, entry);
      items.push(item);
      const same = sameContent(hit.item, entry.candidate) && hit.item.kind === entry.candidate.kind;
      const sample = !same && sampleDataOnly(hit.item, entry.candidate, enumLabels);
      const restated = !same && !sample && hit.item.kind === entry.candidate.kind && restatedOnly(hit.item, entry.candidate);
      const change: ItemChange = same ? "unchanged" : sample ? "sample_data" : restated ? "restated" : "modified";
      changes.push({
        id: item.id,
        kind: item.kind,
        module: item.module,
        change,
        class: sample ? "sample_data" : classOf(item.kind),
        ...(change === "modified" || change === "restated" ? { similarity: Math.round(hit.score * 100) / 100, before: view(hit.item), after: view(item) } : {}),
        ...(change === "modified" && hit.item.kind !== item.kind ? { basis: `同一句话从 ${hit.item.kind} 变成 ${item.kind}（所在标题变了）` } : {}),
        ...(change === "restated" ? { basis: "表格只是换了说法（序号列、列增减、表头改名），共同的单元格没变" } : {}),
        ...(change === "sample_data" ? { basis: "下拉选项过半变化且 spec 没有该字段的枚举：按示例数据处理" } : {}),
      });
      itemIds[item.id] = { ...(itemIds[item.id] ?? { first_revision: revision }), kind: item.kind, module: item.module, anchor: item.anchor, label: item.label, status: "alive", last_revision: revision, first_revision: itemIds[item.id]?.first_revision ?? revision };
      continue;
    }
    if (movedFrom !== undefined) {
      const item = toItem(movedFrom.id, entry);
      items.push(item);
      changes.push({ id: item.id, kind: item.kind, module: item.module, change: "moved", class: classOf(item.kind), basis: `同一条目从 ${modules[movedFrom.module]?.key ?? movedFrom.module} 移到 ${modules[item.module]?.key ?? item.module}`, before: view(movedFrom), after: view(item) });
      itemIds[item.id] = { ...(itemIds[item.id] ?? { first_revision: revision }), kind: item.kind, module: item.module, anchor: item.anchor, label: item.label, status: "alive", last_revision: revision, first_revision: itemIds[item.id]?.first_revision ?? revision };
      continue;
    }
    const id = mintItem();
    const item = toItem(id, entry);
    items.push(item);
    const splitSource = [...splitOf.entries()].find(([, list]) => list.includes(entry))?.[0];
    const mergeSources = mergeOf.get(entry);
    itemIds[id] = {
      kind: item.kind,
      module: item.module,
      anchor: item.anchor,
      label: item.label,
      status: "alive",
      first_revision: revision,
      last_revision: revision,
      ...(splitSource !== undefined ? { split_from: splitSource.id } : {}),
      ...(mergeSources !== undefined ? { merged_from: mergeSources.map((old) => old.id) } : {}),
    };
    if (splitSource === undefined && mergeSources === undefined) changes.push({ id, kind: item.kind, module: item.module, change: "added", class: classOf(item.kind), after: view(item) });
  }
  for (const [old, parts] of splitOf) {
    const ids = parts.map((part) => items.find((item) => item.anchor === part.candidate.anchor && item.module === part.module)?.id).filter((id): id is string => id !== undefined);
    itemIds[old.id] = { ...(itemIds[old.id] as ItemIdentity), status: "split", split_into: ids, last_revision: revision };
    changes.push({ id: old.id, kind: old.kind, module: old.module, change: "split", class: classOf(old.kind), basis: `拆成 ${ids.join("、")}`, before: view(old), related: ids });
  }
  for (const [entry, sources] of mergeOf) {
    const target = items.find((item) => item.anchor === entry.candidate.anchor && item.module === entry.module)?.id ?? "";
    for (const old of sources) itemIds[old.id] = { ...(itemIds[old.id] as ItemIdentity), status: "merged", merged_into: target, last_revision: revision };
    changes.push({ id: target, kind: entry.candidate.kind, module: entry.module, change: "merged", class: classOf(entry.candidate.kind), basis: `由 ${sources.map((old) => old.id).join("、")} 合并`, related: sources.map((old) => old.id), after: view(items.find((item) => item.id === target) ?? { label: entry.candidate.label, text: entry.candidate.text, module: entry.module }) });
  }
  for (const old of previous) {
    if (usedPrev.has(old)) continue;
    if (!removedModules.has(old.module) && !effective.has(old.source)) {
      items.push({ ...old, carried: true });
      changes.push({ id: old.id, kind: old.kind, module: old.module, change: "not_delivered", class: classOf(old.kind), basis: carriedModules.has(old.module) ? "所在模块本次未随交付，沿用上一版" : "来源材料本次未随交付，沿用上一版" });
      itemIds[old.id] = { ...(itemIds[old.id] as ItemIdentity), status: "not_delivered" };
      continue;
    }
    const removalProof = removedModules.has(old.module) ? moduleChanges.find((entry) => entry.id === old.module)?.basis : undefined;
    itemIds[old.id] = { ...(itemIds[old.id] as ItemIdentity), status: "removed", last_revision: revision };
    changes.push({ id: old.id, kind: old.kind, module: old.module, change: "removed", class: classOf(old.kind), basis: removalProof ?? "来源材料本次已交付，该条不再出现", before: view(old) });
  }
  const counts = Object.fromEntries((["unchanged", "restated", "modified", "added", "removed", "moved", "split", "merged", "not_delivered", "sample_data"] as const).map((change) => [change, changes.filter((entry) => entry.change === change).length])) as Record<ItemChange, number>;
  return {
    identity: { ...identity, last_revision: revision, next_module: nextModule, next_item: nextItem, modules, items: itemIds },
    items,
    changes: { from: revision - 1, to: revision, modules: moduleChanges.sort((left, right) => left.key.localeCompare(right.key)), items: changes, counts },
  };
}

/** 任意两版之间的差异：按编号比（相邻两版用对齐时存下的结果，依据更全）。 */
export function compareRevisions(from: number, to: number, before: readonly IntakeItem[], after: readonly IntakeItem[]): RevisionChanges {
  const left = new Map(before.map((item) => [item.id, item]));
  const right = new Map(after.map((item) => [item.id, item]));
  const changes: ItemChangeRecord[] = [];
  const view = (item: IntakeItem) => ({ label: item.label, text: item.text.slice(0, 300), module: item.module });
  for (const [id, item] of right) {
    const old = left.get(id);
    if (old === undefined) changes.push({ id, kind: item.kind, module: item.module, change: "added", class: classOf(item.kind), after: view(item) });
    else if (old.module !== item.module) changes.push({ id, kind: item.kind, module: item.module, change: "moved", class: classOf(item.kind), before: view(old), after: view(item) });
    else if (item.carried === true) changes.push({ id, kind: item.kind, module: item.module, change: "not_delivered", class: classOf(item.kind) });
    else if (!sameContent(old, item)) changes.push({ id, kind: item.kind, module: item.module, change: "modified", class: classOf(item.kind), before: view(old), after: view(item) });
    else changes.push({ id, kind: item.kind, module: item.module, change: "unchanged", class: classOf(item.kind) });
  }
  for (const [id, item] of left) if (!right.has(id)) changes.push({ id, kind: item.kind, module: item.module, change: "removed", class: classOf(item.kind), before: view(item) });
  const counts = Object.fromEntries((["unchanged", "restated", "modified", "added", "removed", "moved", "split", "merged", "not_delivered", "sample_data"] as const).map((change) => [change, changes.filter((entry) => entry.change === change).length])) as Record<ItemChange, number>;
  return { from, to, modules: [], items: changes, counts };
}
