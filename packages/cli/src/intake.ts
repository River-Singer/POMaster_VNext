/**
 * intake.ts —— `pomaster intake read / status / pending / resolve / changes / check`
 * （code-spec：.trellis/spec/pomaster/requirement-intake.md；PRD 11-11-agent-autopilot D-4 / D-1b / IN-1a）。
 *
 * 需求读取（旧 what-bp-should-do 在 VNext 的对应物）：整目录读入原型 HTML、需求 Markdown、变更文档、
 * 设计文档与项目约定，按内容分类、结构无关切块、落成带出处的需求条目，并与上一版对齐出稳定编号与差异。
 * 读不懂的段落列入待判读，由 agent 用 `intake resolve` 给出去向；`intake check` 是反向追溯闸门。
 *
 * 产物全是候选：只写 `.pomaster/prototype/<工作区>/`，不碰 truth、决策、permit、任务与证据。
 * status / pending / changes / check 纯读；read 在所有摘要与判读都没变时 NO_CHANGE 零写入。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { classifyFile, COVERED_CLASSES, FILE_CLASSES, type FileClass, type FileClassification } from "./intake-classify.js";
import {
  changeEvidenceOf,
  changeIdOf,
  changeSummaryOf,
  MARKDOWN_ITEM_KINDS,
  learnChapterRoles,
  readMarkdownDoc,
  readYamlProjectDoc,
  type CandidateItem,
  type ChangeEvidence,
  type JudgedBlock,
} from "./intake-blocks.js";
import { alignRevision, compareRevisions, emptyIdentity, INTAKE_IDENTITY_SCHEMA, type IdentityTable, type IntakeItem, type RevisionChanges } from "./intake-identity.js";
import { anchorText, moduleCore, normalizeText, sha256Hex, slugKey, stripDownloadSuffix } from "./intake-text.js";
import { isDataDerivedText, type PrototypeFact } from "./prototype-extract.js";
import { PROTOTYPE_DIR, runPrototypeIngest, type PrototypeFactsFile } from "./prototype.js";

export const INTAKE_FILES_SCHEMA = "pomaster.intake-files/v1";
export const INTAKE_BLOCKS_SCHEMA = "pomaster.intake-blocks/v1";
export const INTAKE_ITEMS_SCHEMA = "pomaster.intake-items/v1";
export const INTAKE_CHANGES_SCHEMA = "pomaster.intake-changes/v1";
export const INTAKE_RESOLUTIONS_SCHEMA = "pomaster.intake-resolutions/v1";

export interface IntakeFileRecord {
  readonly root: number;
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
  readonly class: FileClass;
  readonly reason: string;
  readonly change_state?: string;
  readonly archived?: boolean;
  /** 被 `intake resolve --file` 改判过。 */
  readonly overridden?: boolean;
}

export interface IntakeFilesSnapshot {
  readonly schema: typeof INTAKE_FILES_SCHEMA;
  readonly revision: number;
  readonly read_at: string;
  readonly inputs: readonly string[];
  readonly resolutions_sha256: string;
  readonly files: readonly IntakeFileRecord[];
}

export interface StoredBlock {
  readonly id: string;
  readonly file: string;
  readonly module: string;
  readonly kind: string;
  readonly role: string;
  readonly heading_path: readonly string[];
  readonly excerpt: string;
  readonly lines: readonly [number, number];
  /** items:<REQ…> / structure / presentation / skip / pending …（resolve 之后的视图另算）。 */
  readonly destination: string;
  readonly items?: readonly string[];
  readonly reason?: string;
}

export interface BlockResolution {
  readonly as: "item" | "gap" | "presentation" | "skip";
  readonly kind?: string;
  readonly text?: string;
  readonly reason?: string;
  readonly recorded_at: string;
}

export interface FileResolution {
  readonly class: FileClass;
  readonly reason: string;
  readonly recorded_at: string;
}

export interface IntakeResolutions {
  readonly schema: typeof INTAKE_RESOLUTIONS_SCHEMA;
  readonly blocks: Readonly<Record<string, BlockResolution>>;
  readonly files: Readonly<Record<string, FileResolution>>;
}

function workspaceRoot(dir: string): string {
  return join(dir, ".pomaster", PROTOTYPE_DIR);
}

export function writeJsonAtomic(path: string, value: unknown): void {
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, path);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const SKIP_DIRS = new Set([".git", "node_modules", ".pomaster", ".svn", ".hg", "dist", "build"]);

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(name)) visit(full);
      } else if (stat.isFile()) out.push(full);
    }
  };
  visit(root);
  return out;
}

function isBinary(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 8000);
  for (let index = 0; index < limit; index += 1) if (bytes[index] === 0) return true;
  return false;
}

interface ScannedFile {
  readonly record: IntakeFileRecord;
  readonly absolute: string;
  readonly text: string | null;
}

function scan(dir: string, inputs: readonly string[], resolutions: IntakeResolutions): ScannedFile[] {
  const files: ScannedFile[] = [];
  inputs.forEach((input, rootIndex) => {
    const absolute = resolve(dir, input);
    const stat = statSync(absolute);
    const base = stat.isDirectory() ? absolute : resolve(absolute, "..");
    for (const file of stat.isDirectory() ? walkFiles(absolute) : [absolute]) {
      const bytes = readFileSync(file);
      const rel = relative(base, file).replace(/\\/g, "/");
      const text = isBinary(bytes) ? null : bytes.toString("utf8");
      const override = resolutions.files[rel];
      const judged: FileClassification = override !== undefined ? { class: override.class, reason: `改判：${override.reason}` } : classifyFile(rel, text);
      files.push({
        absolute: file,
        text,
        record: {
          root: rootIndex,
          path: rel,
          sha256: sha256Hex(bytes),
          size: bytes.length,
          class: judged.class,
          reason: judged.reason,
          ...(judged.change_state !== undefined ? { change_state: judged.change_state } : {}),
          ...(judged.archived === true ? { archived: true } : {}),
          ...(override !== undefined ? { overridden: true } : {}),
        },
      });
    }
  });
  return files;
}

function emptyResolutions(): IntakeResolutions {
  return { schema: INTAKE_RESOLUTIONS_SCHEMA, blocks: {}, files: {} };
}

export interface Workspace {
  readonly name: string;
  readonly dir: string;
  readonly identity: IdentityTable | null;
  readonly resolutions: IntakeResolutions;
}

type Loaded = { ok: true; workspace: Workspace } | { ok: false; errors: CliError[] };

function loadWorkspace(dir: string, name: string): Loaded {
  const wsDir = join(workspaceRoot(dir), name);
  const identityPath = join(wsDir, "identity.json");
  const resolutionsPath = join(wsDir, "resolutions.json");
  try {
    const identity = existsSync(identityPath) ? readJson<IdentityTable>(identityPath) : null;
    if (identity !== null && identity.schema !== INTAKE_IDENTITY_SCHEMA) throw new Error(`identity.json 的 schema 不是 ${INTAKE_IDENTITY_SCHEMA}`);
    const resolutions = existsSync(resolutionsPath) ? readJson<IntakeResolutions>(resolutionsPath) : emptyResolutions();
    if (resolutions.schema !== INTAKE_RESOLUTIONS_SCHEMA) throw new Error(`resolutions.json 的 schema 不是 ${INTAKE_RESOLUTIONS_SCHEMA}`);
    return { ok: true, workspace: { name, dir: wsDir, identity, resolutions } };
  } catch (error) {
    return { ok: false, errors: [{ code: "INTAKE_STATE_UNREADABLE", message: `需求读取工作区 ${name} 的状态读不出来：${(error as Error).message}`, hint: "不会覆盖损坏的文件；修好或移走后再读" }] };
  }
}

/** 只读命令选工作区：给了 --name 用它；否则唯一一个有 identity.json 的工作区。 */
function pickWorkspace(dir: string, name: string | undefined): { ok: true; name: string } | { ok: false; errors: CliError[] } {
  if (name !== undefined) {
    if (!existsSync(join(workspaceRoot(dir), name, "identity.json"))) return { ok: false, errors: [{ code: "INTAKE_WORKSPACE_NOT_FOUND", message: `没有需求读取工作区 ${name}`, hint: "先跑 pomaster intake read <材料目录> --name <名字>" }] };
    return { ok: true, name };
  }
  const root = workspaceRoot(dir);
  const found = existsSync(root) ? readdirSync(root).filter((entry) => existsSync(join(root, entry, "identity.json"))).sort() : [];
  if (found.length === 0) return { ok: false, errors: [{ code: "INTAKE_WORKSPACE_NOT_FOUND", message: "还没有需求读取工作区", hint: "先跑 pomaster intake read <材料目录>" }] };
  if (found.length > 1) return { ok: false, errors: [{ code: "INTAKE_WORKSPACE_AMBIGUOUS", message: `有 ${found.length} 个需求读取工作区：${found.join("、")}`, hint: "加 --name <名字> 指定" }] };
  return { ok: true, name: found[0] ?? "" };
}

function revisionDir(wsDir: string, revision: number): string {
  return join(wsDir, "revisions", `r${revision}`);
}

export interface RevisionData {
  readonly files: IntakeFilesSnapshot;
  readonly blocks: readonly StoredBlock[];
  readonly items: readonly IntakeItem[];
  readonly changes: RevisionChanges;
}

function loadRevision(wsDir: string, revision: number): RevisionData {
  const base = revisionDir(wsDir, revision);
  const files = readJson<IntakeFilesSnapshot>(join(base, "files.json"));
  const blocks = readJson<{ schema: string; blocks: StoredBlock[] }>(join(base, "blocks.json"));
  const items = readJson<{ schema: string; items: IntakeItem[] }>(join(base, "items.json"));
  const changes = readJson<{ schema: string; changes: RevisionChanges }>(join(base, "changes.json"));
  if (files.schema !== INTAKE_FILES_SCHEMA || blocks.schema !== INTAKE_BLOCKS_SCHEMA || items.schema !== INTAKE_ITEMS_SCHEMA || changes.schema !== INTAKE_CHANGES_SCHEMA) throw new Error(`修订 r${revision} 的文件 schema 不对`);
  return { files, blocks: blocks.blocks, items: items.items, changes: changes.changes };
}

const UI_KINDS = new Set(["page", "region", "field", "action", "column", "tab", "notice", "status", "nav", "copy"]);

/** 原型事实 → 候选条目：上下文里的数据派生文字去掉，导航归共享外壳。 */
function uiCandidates(facts: readonly PrototypeFact[], file: string, module: string, source: string): CandidateItem[] {
  const out: CandidateItem[] = [];
  const seen = new Set<string>();
  for (const fact of facts) {
    if (!UI_KINDS.has(fact.kind)) continue;
    if ((fact.kind === "copy" || fact.kind === "status") && isDataDerivedText(fact.label)) continue;
    const context = fact.context.filter((part) => !isDataDerivedText(part));
    const target = fact.kind === "nav" ? "shell" : module;
    const anchor = anchorText(`${fact.kind === "nav" ? "" : context.join("/")}|${fact.label}`);
    const key = `${target}\u0000${fact.kind}\u0000${anchor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: `ui_${fact.kind}`,
      module: target,
      label: normalizeText(fact.label),
      text: normalizeText([...context, fact.label].join(" / ")),
      attrs: fact.attrs,
      anchor,
      origin: { file, block: null, locator: fact.path },
      basis: "extracted",
      source: fact.kind === "nav" ? "shell" : source,
    });
  }
  return out;
}

export interface IntakeReadInput {
  readonly paths: readonly string[];
  readonly name?: string;
  readonly render?: boolean;
  readonly allowNetwork?: boolean;
  /** 测试注入：固定时间戳。 */
  readonly now?: () => string;
}

export interface IntakeSummary {
  readonly workspace: string;
  readonly revision: number;
  readonly files_by_class: Readonly<Record<string, number>>;
  readonly items_by_kind: Readonly<Record<string, number>>;
  readonly pending_blocks: number;
  readonly unknown_files: number;
  readonly changes: Readonly<Record<string, number>> | null;
  readonly modules: { readonly added: number; readonly renamed: number; readonly removed: number; readonly not_delivered: number };
}

export interface IntakeReadResult extends IntakeSummary {
  readonly no_change: boolean;
  readonly out_dir: string;
}

function countBy<T>(values: readonly T[], key: (value: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[key(value)] = (out[key(value)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([left], [right]) => left.localeCompare(right)));
}

function pendingOf(blocks: readonly StoredBlock[], resolutions: IntakeResolutions): StoredBlock[] {
  return blocks.filter((block) => block.destination === "pending" && resolutions.blocks[block.id] === undefined);
}

function unknownOf(files: IntakeFilesSnapshot, resolutions: IntakeResolutions): IntakeFileRecord[] {
  return files.files.filter((file) => file.class === "unknown" && file.size > 0 && resolutions.files[file.path] === undefined);
}

function summaryOf(workspace: string, data: RevisionData, resolutions: IntakeResolutions): IntakeSummary {
  const moduleChanges = data.changes.modules;
  return {
    workspace,
    revision: data.files.revision,
    files_by_class: countBy(data.files.files, (file) => file.class),
    items_by_kind: countBy(data.items, (item) => item.kind),
    pending_blocks: pendingOf(data.blocks, resolutions).length,
    unknown_files: unknownOf(data.files, resolutions).length,
    changes: data.changes.from === 0 ? null : data.changes.counts,
    modules: {
      added: moduleChanges.filter((entry) => entry.change === "added").length,
      renamed: moduleChanges.filter((entry) => entry.change === "renamed").length,
      removed: moduleChanges.filter((entry) => entry.change === "removed").length,
      not_delivered: moduleChanges.filter((entry) => entry.change === "not_delivered").length,
    },
  };
}

const CLASS_ZH: Readonly<Record<string, string>> = {
  requirement_doc: "需求文档",
  change_doc: "变更文档",
  prototype_page: "原型页面",
  prototype_index: "原型目录页",
  prototype_asset: "原型脚本 / 样式",
  sample_data: "示例数据",
  design_doc: "设计文档",
  api_contract: "接口契约",
  contract_doc: "接口说明",
  changelog: "变更记录",
  project_doc: "项目约定",
  tooling: "脚本 / 工程文件",
  binary: "二进制",
  unknown: "未分类",
};

const CHANGE_ZH: Readonly<Record<string, string>> = {
  added: "新增",
  modified: "修改",
  removed: "删除",
  moved: "移动",
  split: "拆分",
  merged: "合并",
  not_delivered: "本次未随交付",
  sample_data: "示例数据变化",
  restated: "仅表述变化",
  unchanged: "不变",
};

function summaryLines(summary: IntakeSummary): string[] {
  const files = Object.entries(summary.files_by_class).map(([cls, count]) => `${CLASS_ZH[cls] ?? cls} ${count}`).join("、");
  const items = Object.entries(summary.items_by_kind).map(([kind, count]) => `${kind} ${count}`).join("、");
  const total = Object.values(summary.items_by_kind).reduce((sum, count) => sum + count, 0);
  const lines = [`文件：${files}`, `条目 ${total} 条：${items}`];
  if (summary.changes !== null) {
    lines.push(`与 r${summary.revision - 1} 相比：${Object.entries(summary.changes).filter(([, count]) => count > 0).map(([change, count]) => `${CHANGE_ZH[change] ?? change} ${count}`).join("、") || "无变化"}`);
    const { added, renamed, removed, not_delivered: notDelivered } = summary.modules;
    if (added + renamed + removed + notDelivered > 0) lines.push(`模块：新增 ${added}、改名 ${renamed}、删除 ${removed}、本次未随交付 ${notDelivered}`);
  }
  lines.push(summary.pending_blocks + summary.unknown_files === 0 ? "每个段落都有去向" : `待判读：${summary.pending_blocks} 个段落、${summary.unknown_files} 个未分类文件（pomaster intake pending 查看，intake resolve 逐条给出去向）`);
  return lines;
}

export async function runIntakeRead(dir: string, input: IntakeReadInput): Promise<CommandOutcome<IntakeReadResult | null>> {
  const now = input.now ?? (() => new Date().toISOString());
  if (input.paths.length === 0) return failOutcome("intake read", null, [{ code: "INTAKE_INPUT_MISSING", message: "没有给材料路径", hint: "pomaster intake read <材料目录或文件...>" }], ["没有给材料路径"]);
  const missing = input.paths.filter((path) => !existsSync(resolve(dir, path)));
  if (missing.length > 0) return failOutcome("intake read", null, missing.map((path) => ({ code: "INTAKE_INPUT_NOT_FOUND", message: `找不到 ${path}`, hint: "路径相对于项目根目录（--dir）" })), missing.map((path) => `找不到 ${path}`));
  const name = input.name ?? (slugKey(stripDownloadSuffix(basename(resolve(dir, input.paths[0] ?? "intake")))) || "intake");
  const loaded = loadWorkspace(dir, name);
  if (!loaded.ok) return failOutcome("intake read", null, loaded.errors, loaded.errors.map((error) => error.message));
  const { workspace } = loaded;
  const identity = workspace.identity ?? emptyIdentity(name);
  const warnings: CliWarning[] = [];

  // 中断恢复：编号大于身份表的修订目录是没写完的，丢掉重建
  const revisionsDir = join(workspace.dir, "revisions");
  if (existsSync(revisionsDir)) {
    for (const entry of readdirSync(revisionsDir)) {
      const number = /^r(\d+)(\.tmp)?$/.exec(entry);
      if (number !== null && (number[2] !== undefined || Number(number[1]) > identity.last_revision)) rmSync(join(revisionsDir, entry), { recursive: true, force: true });
    }
  }

  let previous: RevisionData | null = null;
  if (identity.last_revision > 0) {
    try {
      previous = loadRevision(workspace.dir, identity.last_revision);
    } catch (error) {
      return failOutcome("intake read", null, [{ code: "INTAKE_STATE_UNREADABLE", message: `修订 r${identity.last_revision} 读不出来：${(error as Error).message}`, hint: "不会覆盖损坏的文件；修好或移走后再读" }], ["上一版修订读不出来"]);
    }
  }
  const scanned = scan(dir, input.paths, workspace.resolutions);
  const resolutionsSha = sha256Hex(JSON.stringify(workspace.resolutions));
  const digest = (files: readonly { root: number; path: string; sha256: string; class: string }[]) => sha256Hex(JSON.stringify(files.map((file) => [file.root, file.path, file.sha256, file.class]).sort()));
  if (previous !== null && digest(previous.files.files) === digest(scanned.map((file) => file.record)) && previous.files.resolutions_sha256 === resolutionsSha) {
    const summary = summaryOf(name, previous, workspace.resolutions);
    return okOutcome("intake read", { ...summary, no_change: true, out_dir: relative(dir, workspace.dir).replace(/\\/g, "/") }, [`需求读取 r${summary.revision}（工作区 ${name}）：材料与判读都没变（NO_CHANGE），未写入`, ...summaryLines(summary)]);
  }

  const revision = identity.last_revision + 1;
  const candidates: CandidateItem[] = [];
  const blocks: Array<JudgedBlock & { readonly itemIndexes: readonly number[] }> = [];
  const modules = new Map<string, string>();
  const delivered = new Set<string>(["shell"]);
  const evidence: ChangeEvidence[] = [];
  const pages: ScannedFile[] = [];
  const proposals = new Map<string, { summary: string; file: string }>();
  const chapters = learnChapterRoles(scanned.filter((file) => file.record.class === "requirement_doc" && file.record.archived !== true && file.text !== null).map((file) => file.text ?? ""));
  for (const file of scanned) {
    const { record, text } = file;
    if (text === null || record.archived === true) continue;
    const rel = record.path;
    if (record.class === "prototype_page") {
      pages.push(file);
      continue;
    }
    if (record.class === "change_doc") {
      const changeId = changeIdOf(rel);
      evidence.push(...changeEvidenceOf(rel, text, changeId));
      if (record.change_state === "active" && /\.(md|markdown)$/i.test(rel)) {
        const current = proposals.get(changeId);
        if (current === undefined || /proposal\.md$/i.test(rel)) proposals.set(changeId, { summary: changeSummaryOf(text) || current?.summary || changeId, file: rel });
      }
      continue;
    }
    if (!COVERED_CLASSES.has(record.class)) continue;
    const reading = record.class === "project_doc"
      ? (/\.ya?ml$/i.test(rel) ? readYamlProjectDoc(rel, text) : readMarkdownDoc(rel, text, { module: "project", source: `project:${slugKey(basename(rel).replace(/\.[^.]+$/, ""))}` }))
      : readMarkdownDoc(rel, text, { chapters });
    const offset = candidates.length;
    candidates.push(...reading.items);
    modules.set(reading.module.key, reading.module.title);
    for (const item of reading.items) delivered.add(item.source);
    if (reading.items.length === 0) delivered.add(record.class === "project_doc" ? `project:${slugKey(basename(rel).replace(/\.[^.]+$/, ""))}` : `doc:${reading.module.key}`);
    for (const block of reading.blocks) {
      const resolution = workspace.resolutions.blocks[block.id];
      let indexes = block.destination.type === "items" ? block.destination.items.map((index) => index + offset) : [];
      if (block.destination.type === "pending" && resolution !== undefined && (resolution.as === "item" || resolution.as === "gap")) {
        const kind = resolution.as === "gap" ? "gap" : resolution.kind ?? "rule";
        candidates.push({
          kind,
          module: reading.module.key,
          label: normalizeText(resolution.text ?? "").slice(0, 60),
          text: normalizeText(resolution.text ?? ""),
          attrs: { resolved_block: block.id },
          anchor: anchorText(resolution.text ?? ""),
          origin: { file: rel, block: block.id, locator: `${block.heading_path.join(" > ") || "（文首）"} · L${block.lines[0]}` },
          basis: "resolved",
          source: reading.items[0]?.source ?? (record.class === "project_doc" ? `project:${slugKey(basename(rel).replace(/\.[^.]+$/, ""))}` : `doc:${reading.module.key}`),
        });
        indexes = [candidates.length - 1];
      }
      blocks.push({ ...block, itemIndexes: indexes });
    }
  }
  for (const [changeId, proposal] of proposals) {
    candidates.push({ kind: "change_proposal", module: "changes", label: changeId, text: normalizeText(proposal.summary), attrs: { file: proposal.file }, anchor: anchorText(changeId), origin: { file: proposal.file, block: null, locator: "变更提议" }, basis: "extracted", source: `change:${changeId}` });
    modules.set("changes", "进行中的变更");
    delivered.add(`change:${changeId}`);
  }

  if (pages.length > 0) {
    const moduleByCore = new Map<string, string>();
    for (const key of modules.keys()) {
      moduleByCore.set(key, key);
      moduleByCore.set(moduleCore(key), key);
    }
    const outcome = await runPrototypeIngest(dir, { html: pages.map((page) => page.absolute), name, out: relative(dir, workspace.dir), render: input.render === true, allowNetwork: input.allowNetwork === true });
    warnings.push(...outcome.warnings);
    if (outcome.ok) {
      const facts = readJson<PrototypeFactsFile>(join(workspace.dir, "facts.json"));
      for (const page of pages) {
        const id = `html:${relative(dir, page.absolute).replace(/\\/g, "/")}`;
        const slug = slugKey(basename(page.record.path).replace(/\.[^.]+$/, ""));
        const module = moduleByCore.get(slug) ?? moduleByCore.get(moduleCore(slug)) ?? `page-${slug}`;
        const pageFacts = facts.facts.filter((fact) => fact.source === id);
        if (!modules.has(module)) modules.set(module, pageFacts.find((fact) => fact.kind === "page")?.label ?? slug);
        delivered.add(`page:${slug}`);
        candidates.push(...uiCandidates(pageFacts, page.record.path, module, `page:${slug}`));
      }
      if (candidates.some((item) => item.module === "shell")) modules.set("shell", "共享外壳（导航）");
    } else {
      warnings.push({ code: "INTAKE_PROTOTYPE_UNREAD", message: `原型页面没读成：${outcome.errors.map((error) => error.message).join("；")}`, hint: "需求文档照常读入；修好后重读" });
    }
  }

  const aligned = alignRevision({ identity, previous: previous?.items ?? [], candidates, modules, evidence, revision, delivered });
  const stored: StoredBlock[] = blocks.map((block) => {
    // alignRevision 的不变式：items 的前 candidates.length 条与 candidates 一一按序对应
    const ids = block.itemIndexes.map((index) => aligned.items[index]?.id).filter((id): id is string => id !== undefined);
    const resolution = workspace.resolutions.blocks[block.id];
    const destination = block.itemIndexes.length > 0 ? (resolution?.as === "gap" ? "gap" : "items") : block.destination.type === "pending" && resolution !== undefined ? resolution.as : block.destination.type;
    return {
      id: block.id,
      file: block.file,
      module: block.module,
      kind: block.kind,
      role: block.role,
      heading_path: block.heading_path,
      excerpt: block.excerpt,
      lines: block.lines,
      destination,
      ...(ids.length > 0 ? { items: ids } : {}),
      ...(block.destination.type === "skip" ? { reason: block.destination.reason } : resolution?.reason !== undefined ? { reason: resolution.reason } : {}),
    };
  });
  const files: IntakeFilesSnapshot = { schema: INTAKE_FILES_SCHEMA, revision, read_at: now(), inputs: input.paths, resolutions_sha256: resolutionsSha, files: scanned.map((file) => file.record) };

  const tempDir = `${revisionDir(workspace.dir, revision)}.tmp`;
  mkdirSync(tempDir, { recursive: true });
  writeFileSync(join(tempDir, "files.json"), `${JSON.stringify(files, null, 2)}\n`, "utf8");
  writeFileSync(join(tempDir, "blocks.json"), `${JSON.stringify({ schema: INTAKE_BLOCKS_SCHEMA, blocks: stored }, null, 2)}\n`, "utf8");
  writeFileSync(join(tempDir, "items.json"), `${JSON.stringify({ schema: INTAKE_ITEMS_SCHEMA, items: aligned.items }, null, 2)}\n`, "utf8");
  writeFileSync(join(tempDir, "changes.json"), `${JSON.stringify({ schema: INTAKE_CHANGES_SCHEMA, changes: aligned.changes, evidence }, null, 2)}\n`, "utf8");
  renameSync(tempDir, revisionDir(workspace.dir, revision));
  writeJsonAtomic(join(workspace.dir, "identity.json"), aligned.identity);
  if (!existsSync(join(workspace.dir, "resolutions.json"))) writeJsonAtomic(join(workspace.dir, "resolutions.json"), workspace.resolutions);

  const summary = summaryOf(name, { files, blocks: stored, items: aligned.items, changes: aligned.changes }, workspace.resolutions);
  const human = [
    `需求读取 r${revision}（工作区 ${name}，${relative(dir, workspace.dir).replace(/\\/g, "/")}）`,
    ...summaryLines(summary),
    summary.pending_blocks + summary.unknown_files > 0 ? "下一步：pomaster intake pending → 逐条 intake resolve → intake check" : "下一步：pomaster intake changes 看差异；intake check 确认覆盖完整",
  ];
  return okOutcome("intake read", { ...summary, no_change: false, out_dir: relative(dir, workspace.dir).replace(/\\/g, "/") }, human, warnings);
}

export type LatestLoaded = { ok: true; workspace: Workspace; data: RevisionData } | { ok: false; errors: CliError[] };

/** 最新修订（给 intake draft 等下游读；纯读）。 */
export function loadIntakeLatest(dir: string, name: string | undefined): LatestLoaded {
  return loadLatest(dir, name);
}

function loadLatest(dir: string, name: string | undefined): LatestLoaded {
  const picked = pickWorkspace(dir, name);
  if (!picked.ok) return picked;
  const loaded = loadWorkspace(dir, picked.name);
  if (!loaded.ok) return loaded;
  const identity = loaded.workspace.identity;
  if (identity === null || identity.last_revision === 0) return { ok: false, errors: [{ code: "INTAKE_WORKSPACE_NOT_FOUND", message: `工作区 ${picked.name} 还没有修订`, hint: "先跑 pomaster intake read" }] };
  try {
    return { ok: true, workspace: loaded.workspace, data: loadRevision(loaded.workspace.dir, identity.last_revision) };
  } catch (error) {
    return { ok: false, errors: [{ code: "INTAKE_STATE_UNREADABLE", message: `修订 r${identity.last_revision} 读不出来：${(error as Error).message}`, hint: "不会覆盖损坏的文件" }] };
  }
}

export function runIntakeStatus(dir: string, input: { readonly name?: string }): CommandOutcome<IntakeSummary | null> {
  const loaded = loadLatest(dir, input.name);
  if (!loaded.ok) return failOutcome("intake status", null, loaded.errors, loaded.errors.map((error) => error.message));
  const summary = summaryOf(loaded.workspace.name, loaded.data, loaded.workspace.resolutions);
  return okOutcome("intake status", summary, [`需求读取 r${summary.revision}（工作区 ${summary.workspace}）`, ...summaryLines(summary)]);
}

export interface IntakePendingResult {
  readonly workspace: string;
  readonly revision: number;
  readonly blocks: readonly StoredBlock[];
  readonly files: readonly IntakeFileRecord[];
}

export function runIntakePending(dir: string, input: { readonly name?: string }): CommandOutcome<IntakePendingResult | null> {
  const loaded = loadLatest(dir, input.name);
  if (!loaded.ok) return failOutcome("intake pending", null, loaded.errors, loaded.errors.map((error) => error.message));
  const blocks = pendingOf(loaded.data.blocks, loaded.workspace.resolutions);
  const files = unknownOf(loaded.data.files, loaded.workspace.resolutions);
  const human = [
    blocks.length + files.length === 0 ? `r${loaded.data.files.revision}：没有待判读的段落与文件` : `r${loaded.data.files.revision}：待判读 ${blocks.length} 个段落、${files.length} 个未分类文件`,
    ...files.slice(0, 20).map((file) => `  [文件] ${file.path}：${file.reason}（intake resolve --file ${file.path} --class <类别> --reason <理由>）`),
    ...blocks.slice(0, 60).map((block) => `  ${block.id}  ${block.file}:${block.lines[0]}  〔${block.heading_path.at(-1) ?? "文首"}〕 ${block.excerpt.slice(0, 80)}`),
    ...(blocks.length > 60 ? [`  ……另有 ${blocks.length - 60} 段，用 --json 看全部`] : []),
    ...(blocks.length > 0 ? ["给出去向：pomaster intake resolve --block <B-…> --as item --kind <rule|field|scenario|…> --text <条目> | --as gap --text <缺口> | --as presentation|skip --reason <理由>"] : []),
  ];
  return okOutcome("intake pending", { workspace: loaded.workspace.name, revision: loaded.data.files.revision, blocks, files }, human);
}

export interface IntakeResolveInput {
  readonly name?: string;
  /** 可一次给多个段落同一个去向（如一批同类说明都按 skip 处理）。 */
  readonly block?: string | readonly string[];
  readonly file?: string;
  readonly as?: string;
  readonly kind?: string;
  readonly text?: string;
  readonly reason?: string;
  readonly fileClass?: string;
  readonly now?: () => string;
}

export function runIntakeResolve(dir: string, input: IntakeResolveInput): CommandOutcome<{ readonly workspace: string; readonly targets: readonly string[]; readonly recorded: BlockResolution | FileResolution } | null> {
  const now = input.now ?? (() => new Date().toISOString());
  const invalid = (message: string) => failOutcome("intake resolve", null, [{ code: "INTAKE_RESOLVE_INVALID", message, hint: "pomaster intake resolve --block <B-…> --as item|gap|presentation|skip …，或 --file <路径> --class <类别> --reason <理由>" }], [message]);
  const hasBlock = input.block !== undefined && (typeof input.block === "string" || input.block.length > 0);
  if (hasBlock === (input.file !== undefined)) return invalid("--block 与 --file 必须二选一");
  const loaded = loadLatest(dir, input.name);
  if (!loaded.ok) return failOutcome("intake resolve", null, loaded.errors, loaded.errors.map((error) => error.message));
  const { workspace, data } = loaded;
  let blocks = workspace.resolutions.blocks;
  let files = workspace.resolutions.files;
  let recorded: BlockResolution | FileResolution;
  let targets: string[];
  if (input.file !== undefined) {
    const file = data.files.files.find((entry) => entry.path === input.file);
    if (file === undefined) return failOutcome("intake resolve", null, [{ code: "INTAKE_FILE_NOT_FOUND", message: `最新修订里没有文件 ${input.file}`, hint: "路径按 intake pending 列出的写法" }], [`没有文件 ${input.file}`]);
    if (input.fileClass === undefined || !(FILE_CLASSES as readonly string[]).includes(input.fileClass) || input.fileClass === "unknown") return invalid(`--class 必须是：${FILE_CLASSES.filter((cls) => cls !== "unknown").join(" / ")}`);
    if (input.reason === undefined || input.reason.trim() === "") return invalid("改判文件类别要写 --reason");
    recorded = { class: input.fileClass as FileClass, reason: input.reason.trim(), recorded_at: now() };
    files = { ...files, [file.path]: recorded };
    targets = [file.path];
  } else {
    const ids = typeof input.block === "string" ? [input.block] : [...(input.block ?? [])];
    const missing = ids.filter((id) => !data.blocks.some((entry) => entry.id === id));
    if (ids.length === 0 || missing.length > 0) return failOutcome("intake resolve", null, [{ code: "INTAKE_BLOCK_NOT_FOUND", message: `最新修订里没有段落 ${missing.join("、")}`, hint: "编号按 intake pending 列出的写" }], [`没有段落 ${missing.join("、")}`]);
    if (ids.length > 1 && (input.as === "item" || input.as === "gap")) return invalid("一次给多个段落时只能用 --as presentation 或 --as skip（条目与缺口要逐段写内容）");
    const as = input.as;
    if (as !== "item" && as !== "gap" && as !== "presentation" && as !== "skip") return invalid("--as 必须是 item / gap / presentation / skip");
    if (as === "item" && (input.kind === undefined || !(MARKDOWN_ITEM_KINDS as readonly string[]).includes(input.kind) || input.kind === "gap" || input.kind === "change_proposal")) return invalid(`--as item 要带 --kind：${MARKDOWN_ITEM_KINDS.filter((kind) => kind !== "gap" && kind !== "change_proposal").join(" / ")}`);
    if ((as === "item" || as === "gap") && (input.text === undefined || input.text.trim() === "")) return invalid(`--as ${as} 要写 --text（条目或缺口的内容）`);
    if (as === "skip" && (input.reason === undefined || input.reason.trim() === "")) return invalid("--as skip 要写 --reason（为什么不采用）");
    const blockRecord: BlockResolution = {
      as,
      ...(as === "item" ? { kind: input.kind as string } : {}),
      ...(input.text !== undefined && (as === "item" || as === "gap") ? { text: input.text.trim() } : {}),
      ...(input.reason !== undefined ? { reason: input.reason.trim() } : {}),
      recorded_at: now(),
    };
    recorded = blockRecord;
    blocks = { ...blocks, ...Object.fromEntries(ids.map((id) => [id, blockRecord])) };
    targets = ids;
  }
  writeJsonAtomic(join(workspace.dir, "resolutions.json"), { schema: INTAKE_RESOLUTIONS_SCHEMA, blocks, files });
  return okOutcome("intake resolve", { workspace: workspace.name, targets, recorded }, [`已记录 ${targets.length === 1 ? targets[0] : `${targets.length} 个段落`} 的判读；下次 pomaster intake read 时生效（条目编号在那时分配）`]);
}

export interface IntakeChangesResult {
  readonly workspace: string;
  readonly from: number;
  readonly to: number;
  readonly changes: RevisionChanges;
}

export function runIntakeChanges(dir: string, input: { readonly name?: string; readonly from?: number; readonly to?: number }): CommandOutcome<IntakeChangesResult | null> {
  const loaded = loadLatest(dir, input.name);
  if (!loaded.ok) return failOutcome("intake changes", null, loaded.errors, loaded.errors.map((error) => error.message));
  const last = loaded.data.files.revision;
  const to = input.to ?? last;
  const from = input.from ?? to - 1;
  if (!Number.isInteger(to) || !Number.isInteger(from) || to < 1 || to > last || from < 0 || from >= to) {
    return failOutcome("intake changes", null, [{ code: "INTAKE_REVISION_NOT_FOUND", message: `修订范围 r${from} → r${to} 不成立（现有 r1…r${last}）`, hint: "--from 小于 --to，且都在已有修订之内" }], ["修订范围不成立"]);
  }
  let changes: RevisionChanges;
  try {
    const target = to === last ? loaded.data : loadRevision(loaded.workspace.dir, to);
    changes = from === to - 1 ? target.changes : compareRevisions(from, to, loadRevision(loaded.workspace.dir, from).items, target.items);
  } catch (error) {
    return failOutcome("intake changes", null, [{ code: "INTAKE_STATE_UNREADABLE", message: (error as Error).message, hint: "不会覆盖损坏的文件" }], ["修订读不出来"]);
  }
  const notable = changes.items.filter((entry) => entry.change !== "unchanged");
  const human = [
    `r${from} → r${to}：${Object.entries(changes.counts).filter(([, count]) => count > 0).map(([change, count]) => `${CHANGE_ZH[change] ?? change} ${count}`).join("、") || "无变化"}`,
    ...changes.modules.filter((entry) => entry.change !== "unchanged").map((entry) => `  模块 ${entry.id} ${entry.key}：${entry.change === "renamed" ? `改名（原 ${entry.renamed_from ?? ""}）` : CHANGE_ZH[entry.change] ?? entry.change}${entry.basis !== undefined ? `；依据：${entry.basis}` : ""}`),
    ...notable.slice(0, 60).map((entry) => `  ${entry.id} [${entry.kind}] ${CHANGE_ZH[entry.change] ?? entry.change}：${entry.after?.label ?? entry.before?.label ?? ""}${entry.change === "modified" && entry.before !== undefined && entry.after !== undefined ? `\n      旧：${entry.before.text.slice(0, 100)}\n      新：${entry.after.text.slice(0, 100)}` : ""}${entry.basis !== undefined ? `（${entry.basis}）` : ""}`),
    ...(notable.length > 60 ? [`  ……另有 ${notable.length - 60} 条，用 --json 看全部`] : []),
  ];
  return okOutcome("intake changes", { workspace: loaded.workspace.name, from, to, changes }, human);
}

export interface IntakeCheckResult {
  readonly workspace: string;
  readonly revision: number;
  readonly blocks_total: number;
  readonly pending_blocks: number;
  readonly unknown_files: number;
}

export function runIntakeCheck(dir: string, input: { readonly name?: string }): CommandOutcome<IntakeCheckResult | null> {
  const loaded = loadLatest(dir, input.name);
  if (!loaded.ok) return failOutcome("intake check", null, loaded.errors, loaded.errors.map((error) => error.message));
  const pending = pendingOf(loaded.data.blocks, loaded.workspace.resolutions);
  const unknown = unknownOf(loaded.data.files, loaded.workspace.resolutions);
  const result: IntakeCheckResult = { workspace: loaded.workspace.name, revision: loaded.data.files.revision, blocks_total: loaded.data.blocks.length, pending_blocks: pending.length, unknown_files: unknown.length };
  if (pending.length + unknown.length > 0) {
    const errors: CliError[] = [
      ...(pending.length > 0 ? [{ code: "INTAKE_PENDING", message: `${pending.length} 个段落还没有去向`, hint: "pomaster intake pending 列出待判读段落，逐条 intake resolve" }] : []),
      ...(unknown.length > 0 ? [{ code: "INTAKE_FILE_UNCLASSIFIED", message: `${unknown.length} 个文件没分类：${unknown.slice(0, 5).map((file) => file.path).join("、")}`, hint: "intake resolve --file <路径> --class <类别> --reason <理由>" }] : []),
    ];
    return failOutcome("intake check", result, errors, [`覆盖未完成（r${result.revision}）：${pending.length} 个段落待判读、${unknown.length} 个文件未分类`]);
  }
  return okOutcome("intake check", result, [`覆盖完整（r${result.revision}）：${result.blocks_total} 个段落都有去向，所有文件都已分类。这是读取覆盖的判定，不是需求已被接受`]);
}
