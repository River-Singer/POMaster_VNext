/**
 * standards-map.ts —— 规范的空间与抽屉：项目规范按哪些层组织、每层有哪些抽屉、哪些抽屉对当前项目生效。
 *
 * 空间是系统里的一层：前端、前端服务器、后端、数据库、缓存、消息与异步、平台与运维、安全、测试。
 * 每个空间有一组通用规范（主题文档，跨语言、跨框架都成立），再按需要挂抽屉：
 * - 架构形态（模块化单体、微服务、Serverless）、语言（Java、PHP、Python、Go……）、框架（Spring、Laravel、Django……）、
 *   产品（MySQL、Redis、Nginx……）；
 * - 抽屉有现成规范文档的是「已有」；还没有的是「预留」——项目用到时由 `update spec --drawer` 建项目抽屉文档并写入。
 *
 * 生效判定只读不写：技术基线的选型（baseline/<lane>/stack.yaml）与仓库信号（构建与依赖清单、配置文件名）
 * 任一命中即生效，命中原因逐条列出。通用规范对所有项目生效，不需要判定。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { seedsRootCandidates } from "./seed-manifest.js";

export type StandardsLane = "frontend" | "backend" | "data" | "platform";
export type DrawerKind = "architecture" | "language" | "framework" | "persistence" | "product";

export const DRAWER_KIND_TITLES: Readonly<Record<DrawerKind, string>> = {
  architecture: "架构形态",
  language: "语言",
  framework: "框架与运行时",
  persistence: "持久层",
  product: "产品",
};

export interface StandardsDrawer {
  readonly id: string;
  readonly title_zh: string;
  readonly kind: DrawerKind;
  /** 现成规范文档（相对 specs/hard/）；null = 预留抽屉。 */
  readonly doc: string | null;
  readonly summary_zh: string;
  /** 技术基线选型：lane 的 stack.yaml 里这个键的取值命中任一词（字母数字边界、不分大小写）。 */
  readonly stack?: { readonly lane: StandardsLane; readonly keys: readonly string[]; readonly words: readonly string[] };
  /** 仓库信号：根目录或一级子目录里出现这些文件名。 */
  readonly files?: readonly string[];
  /** 仓库信号：依赖与构建清单里出现这些依赖名。 */
  readonly deps?: readonly string[];
}

export interface StandardsTestType {
  readonly id: string;
  readonly title_zh: string;
  readonly proves_zh: string;
  /** 对应的证据规范（specs/evidence/<slug>.md）。 */
  readonly evidence: readonly string[];
}

export interface StandardsSpace {
  readonly key: string;
  readonly title_zh: string;
  readonly summary_zh: string;
  /** 通用规范：主题文档（specs/hard/themes/<slug>.md），所有项目生效。 */
  readonly themes: readonly string[];
  readonly drawers: readonly StandardsDrawer[];
  /** 只有测试空间有：测试类型与证据规范的对应。 */
  readonly tests?: readonly StandardsTestType[];
}

/** 空间与抽屉的数据住在包内 seeds/standards/spaces.json（Storybook 生成器与 CLI 同读这一份）。 */
export const STANDARDS_SPACES_RELATIVE = "standards/spaces.json";

interface StandardsData {
  readonly schema: string;
  readonly theme_titles: Readonly<Record<string, string>>;
  readonly evidence_titles: Readonly<Record<string, string>>;
  readonly spaces: readonly StandardsSpace[];
}

function loadStandardsData(): StandardsData {
  for (const root of seedsRootCandidates(import.meta.url)) {
    const path = join(root, STANDARDS_SPACES_RELATIVE);
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as StandardsData;
  }
  throw new Error(`standards spaces asset not found: seeds/${STANDARDS_SPACES_RELATIVE}`);
}

const STANDARDS_DATA = loadStandardsData();

export const STANDARDS_SPACES: readonly StandardsSpace[] = STANDARDS_DATA.spaces;
/** 通用主题文档的标题（slug → 标题）。 */
export const STANDARDS_THEME_TITLES: Readonly<Record<string, string>> = STANDARDS_DATA.theme_titles;
/** 证据规范的标题（slug → 标题）。 */
export const STANDARDS_EVIDENCE_TITLES: Readonly<Record<string, string>> = STANDARDS_DATA.evidence_titles;

export function allDrawers(): Array<StandardsDrawer & { readonly space: string }> {
  return STANDARDS_SPACES.flatMap((space) => space.drawers.map((drawer) => ({ ...drawer, space: space.key })));
}

export function findDrawer(id: string): (StandardsDrawer & { readonly space: string }) | undefined {
  return allDrawers().find((drawer) => drawer.id === id);
}

/** 预留抽屉在项目里落成的文档（相对 specs/hard/）。 */
export function projectDrawerDoc(id: string): string {
  return `stacks/${id}/${id}-project-overlay.md`;
}

/** 预留抽屉第一次写入时建的项目抽屉文档：只有标题、适用说明与三个语气章节，条文由 update spec 写入。 */
export function renderProjectDrawerDoc(drawer: StandardsDrawer, spaceTitle: string): string {
  return [
    `# ${drawer.title_zh} 规范（项目抽屉）`,
    "",
    `${spaceTitle} / ${DRAWER_KIND_TITLES[drawer.kind]}：${drawer.summary_zh}`,
    "",
    "本文件由 pomaster update spec --drawer 建立并维护；条文按规范写入契约写入。",
    "",
    "## MUST",
    "",
    "## MUST NOT",
    "",
    "## SHOULD",
    "",
  ].join("\n");
}

// ============================================================
// 生效判定
// ============================================================

export interface DrawerState {
  readonly id: string;
  readonly space: string;
  readonly title_zh: string;
  readonly kind: DrawerKind;
  /** available = 有现成规范文档；project = 预留抽屉已在项目里建了文档；reserved = 预留。 */
  readonly status: "available" | "project" | "reserved";
  readonly doc: string | null;
  readonly active: boolean;
  readonly reasons: readonly string[];
}

export interface StandardsResult {
  readonly spaces: ReadonlyArray<{
    readonly key: string;
    readonly title_zh: string;
    readonly summary_zh: string;
    readonly themes: readonly string[];
    readonly drawers: readonly DrawerState[];
    readonly tests?: readonly StandardsTestType[];
  }>;
  readonly active: readonly string[];
}

function readStack(dir: string, lane: StandardsLane): Map<string, string> {
  const out = new Map<string, string>();
  const path = join(dir, ".pomaster", "baseline", lane, "stack.yaml");
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([a-z_]+):\s*(.+?)\s*$/.exec(line);
    if (match === null) continue;
    const value = (match[2] ?? "").replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
    if (value !== "" && value !== "UNKNOWN") out.set(match[1] ?? "", value);
  }
  return out;
}

const SKIP_DIRS = new Set(["node_modules", ".pomaster", ".git", "dist", "build", "target", "vendor", ".venv", "venv"]);
const MANIFESTS = ["package.json", "pom.xml", "build.gradle", "build.gradle.kts", "composer.json", "pyproject.toml", "requirements.txt", "Pipfile", "go.mod"];

interface RepoSignals {
  readonly names: Set<string>;
  readonly manifests: string;
}

/** 根目录与一级子目录的文件名，以及依赖与构建清单的文本（小写）。 */
function readRepoSignals(dir: string): RepoSignals {
  const names = new Set<string>();
  const texts: string[] = [];
  const visit = (base: string, depth: number): void => {
    let entries: string[] = [];
    try {
      entries = readdirSync(base);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      names.add(name);
      const absolute = join(base, name);
      let isDir = false;
      try {
        isDir = statSync(absolute).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        if (depth === 0) visit(absolute, 1);
      } else if (MANIFESTS.includes(name)) {
        try {
          texts.push(readFileSync(absolute, "utf8").toLowerCase());
        } catch {
          // 读不到的清单不参与判定
        }
      }
    }
  };
  visit(dir, 0);
  return { names, manifests: texts.join("\n") };
}

function wordHit(value: string, word: string): boolean {
  const escaped = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(value.toLowerCase());
}

/** 依赖名命中：前面是边界，后面可以接 `-` 延伸出同族包（spring-boot → spring-boot-starter-web），不接字母数字。 */
function depHit(manifests: string, dep: string): boolean {
  const escaped = dep.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9@/_.-])${escaped}(?=[^a-z0-9_]|$)`).test(manifests);
}

export function resolveStandards(dir: string): StandardsResult {
  const stacks = new Map<StandardsLane, Map<string, string>>(
    (["frontend", "backend", "data", "platform"] as const).map((lane) => [lane, readStack(dir, lane)]),
  );
  const repo = readRepoSignals(dir);
  const hardRoot = join(dir, ".pomaster", "specs", "hard");
  const active: string[] = [];
  const spaces = STANDARDS_SPACES.map((space) => ({
    key: space.key,
    title_zh: space.title_zh,
    summary_zh: space.summary_zh,
    themes: space.themes,
    ...(space.tests === undefined ? {} : { tests: space.tests }),
    drawers: space.drawers.map((drawer): DrawerState => {
      const reasons: string[] = [];
      if (drawer.stack !== undefined) {
        const values = stacks.get(drawer.stack.lane) ?? new Map<string, string>();
        for (const key of drawer.stack.keys) {
          const value = values.get(key);
          if (value !== undefined && drawer.stack.words.some((word) => wordHit(value, word))) {
            reasons.push(`技术基线 ${drawer.stack.lane}.${key}=${value}`);
          }
        }
      }
      for (const file of drawer.files ?? []) if (repo.names.has(file)) reasons.push(`仓库里有 ${file}`);
      for (const dep of drawer.deps ?? []) if (depHit(repo.manifests, dep)) reasons.push(`依赖里有 ${dep}`);
      const projectDoc = projectDrawerDoc(drawer.id);
      const status: DrawerState["status"] = drawer.doc !== null ? "available" : existsSync(join(hardRoot, projectDoc)) ? "project" : "reserved";
      const doc = drawer.doc ?? (status === "project" ? projectDoc : null);
      if (reasons.length > 0) active.push(drawer.id);
      return { id: drawer.id, space: space.key, title_zh: drawer.title_zh, kind: drawer.kind, status, doc, active: reasons.length > 0, reasons };
    }),
  }));
  return { spaces, active };
}

// ============================================================
// pomaster standards
// ============================================================

const STATUS_TITLES: Readonly<Record<DrawerState["status"], string>> = { available: "已有", project: "项目抽屉", reserved: "预留" };

export function runStandards(dir: string, options: { readonly show?: string } = {}): CommandOutcome<StandardsResult | null> {
  const result = resolveStandards(dir);
  if (options.show !== undefined) {
    const space = result.spaces.find((item) => item.key === options.show);
    const drawer = result.spaces.flatMap((item) => item.drawers).find((item) => item.id === options.show);
    if (space === undefined && drawer === undefined) {
      return failOutcome("standards", null, [{ code: "STANDARDS_UNKNOWN", message: `没有空间或抽屉 ${options.show}`, hint: "pomaster standards 列出全部空间与抽屉的编号" }], [`standards: FAILED — STANDARDS_UNKNOWN`]);
    }
    if (space !== undefined) {
      const lines = [
        `standards: ${space.title_zh}（${space.key}）`,
        `  ${space.summary_zh}`,
        "  通用规范（所有项目生效）：",
        ...space.themes.map((theme) => `    .pomaster/specs/hard/themes/${theme}.md`),
        ...(space.tests ?? []).map((test) => `  ${test.title_zh}（${test.id}）：${test.proves_zh} 证据规范：${test.evidence.map((slug) => `specs/evidence/${slug}.md`).join("、")}`),
        ...space.drawers.map((item) => `  [${item.active ? "生效" : "  "}] ${item.id} ${item.title_zh}（${DRAWER_KIND_TITLES[item.kind]}，${STATUS_TITLES[item.status]}）${item.reasons.length > 0 ? `——${item.reasons.join("；")}` : ""}`),
      ];
      return okOutcome("standards", result, lines);
    }
    const found = drawer!;
    const definition = findDrawer(found.id)!;
    return okOutcome("standards", result, [
      `standards: ${found.title_zh}（${found.id}）——${DRAWER_KIND_TITLES[found.kind]}，${STATUS_TITLES[found.status]}，${found.active ? "对本项目生效" : "本项目未用到"}`,
      `  ${definition.summary_zh}`,
      found.doc === null ? `  还没有规范文档；第一次写入时建 .pomaster/specs/hard/${projectDrawerDoc(found.id)}` : `  规范文档：.pomaster/specs/hard/${found.doc}`,
      ...(found.reasons.length > 0 ? [`  生效原因：${found.reasons.join("；")}`] : []),
      `  写入：pomaster update spec "<规则>" --drawer ${found.id} --scope … --why … --check-by … --do … --dont … --by <actor>`,
    ]);
  }
  const lines = ["standards: 规范的空间与抽屉（[生效] = 技术基线或仓库信号命中；通用规范对所有项目生效）"];
  for (const space of result.spaces) {
    lines.push(`  ${space.title_zh}（${space.key}）：通用 ${space.themes.length} 份主题文档${space.tests === undefined ? "" : `，${space.tests.length} 类测试`}`);
    for (const item of space.drawers) {
      lines.push(`    [${item.active ? "生效" : "  "}] ${item.id} ${item.title_zh}（${DRAWER_KIND_TITLES[item.kind]}，${STATUS_TITLES[item.status]}）${item.reasons.length > 0 ? `——${item.reasons.join("；")}` : ""}`);
    }
  }
  lines.push(`  生效抽屉：${result.active.length === 0 ? "（无；先回填技术基线，或在项目根目录运行）" : result.active.join("、")}`);
  return okOutcome("standards", result, lines);
}
