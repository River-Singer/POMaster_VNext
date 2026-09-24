/**
 * analyzer-import-graph.ts —— import 静态扫描 Analyzer（P-v06 批次 2 Frontend 模型
 * kernel 逻辑半场；PRD v0.6 §103 Analyzer Catalog + §148 Analyzer Output Contract +
 * §6-8 Software Graph Typed Relation）。
 *
 * 出处锚：
 * - PRD v0.6 §103：analyzer 是 Graph 边的产出者——本模块静态扫描源文件 import 面，
 *   产出 CALLS 边**提案**（source=调用方 governed id / target=被调用方 governed id，
 *   经 mapping 相对路径→governed id 派生）；提案经消费方 relations.registerRelation
 *   显式登记入台账（EDGE-<12hex> 内容寻址幂等——重复扫描重放 noop 安全，批次 1
 *   Tracer 词形锚 ANALYZER.TS.IMPORT_GRAPH 的实体化）。
 * - PRD v0.6 §148 八字段必答：产出 report 经 normalizeAnalyzerReport 判卷（批次 0
 *   analyzer-contract 单一实现——「只返回成功项」结构性写不出合法报告）；置信级规则
 *   =unmapped 清单空 → deterministic，非空 → probable（确定性宣称杀手同源：
 *   unresolved 非空禁 deterministic——normalizeAnalyzerReport 二道闸兜底）。
 * - analyze-only 封条（spec-analyzer.ts / analyzer-contract.ts 先例，结构性非约定）：
 *   导出面无任何写函数（产出边提案不落盘）；零 fs（输入是文件内容集不是目录——
 *   扫描与读盘分离，读盘归调用方）；零 store 依赖（签名无 Store——类型层断言）。
 *
 * 已知边界（诚实声明，禁伪装全知）：
 * - 不做注释内 import 剔除：注释/字符串字面量中形似 import 的词面会误报进 edges——
 *   该误报风险由置信级承载（调用方对词面噪声敏感的产物应按 probable 处置或人工复核）；
 * - 扫静态 `import ... from '...'`、动态 `import('...')` 与 re-export；require()、
 *   CSS/模板内引用仍不在扫描面（显式缺席非缺陷）；
 * - 路径按 posix 精确匹配 mapping 键（不做分隔符归一——Windows 产物先归一再注入）；
 *   相对引用先以源文件目录折叠为仓库相对路径（posix 语义消解 ./ ../），再按候选
 *   后缀序（原样/.ts/.tsx/.vue/.js//index.ts）匹配 mapping——首个命中者胜；
 * - mapping 覆盖面是调用方申报的分母：未登记进 mapping 的源文件不产边（其 import
 *   进 unmapped 清单 reason=source_not_mapped——禁静默丢弃，objectsResolved 与
 *   files.length 的差额即披露位）。
 *
 * 词形纪律：producer 词形 ANALYZER.TS.IMPORT_GRAPH（§103 Catalog 词形族，批次 1
 * Tracer 词面锚）；CALLS ∈ RELATION_TYPE_VALUES 首批
 * 8 值（PR-0006，「只收真实消费」）；source/target 过 parseGovernedId（A5 closed-world
 * ——mapping 值非法 = SCHEMA_INVALID 整体拒绝，禁静默跳过坏条目）。
 */
import { GovernanceError, GovernedIdParseError } from "./errors.js";
import { parseGovernedId } from "./id.js";
import { normalizeAnalyzerReport, type AnalyzerReport } from "./analyzer-contract.js";

// ============================================================
// 词形与扫描常量
// ============================================================

/** 本 analyzer 的自报词形（§103 Catalog 词形族；批次 1 Tracer 词面锚的实体化）。 */
export const ANALYZER_IMPORT_GRAPH_ID = "ANALYZER.TS.IMPORT_GRAPH" as const;

/** 边提案的关系类型（首批 8 值闭包内的 CALLS——静态 import 面的语义落点）。 */
export const IMPORT_EDGE_TYPE = "CALLS" as const;

/** 源码引用候选后缀序（首个命中者胜；与 recon 源文件扩展闭包对齐）。 */
export const RELATIVE_IMPORT_CANDIDATE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".vue",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  "/index.ts",
  "/index.tsx",
  "/index.vue",
  "/index.js",
  "/index.jsx",
  "/index.mjs",
  "/index.cjs",
] as const;

/** 静态 import 词面（含 type import / 具名/默认/命名空间/副作用裸导入；不含 import(）。 */
const STATIC_IMPORT_RE = /\bimport\b\s+(?:type\s+)?(?:[\w*{},\s$]+?\s+from\s+)?["']([^"']+)["']/g;

/** 动态 import 词面（import('...')；两条正则之一——模块头「已知边界」）。 */
const DYNAMIC_IMPORT_RE = /\bimport\b\s*\(\s*["']([^"']+)["']\s*\)/g;

/** re-export 词面（export * / export * as / export { ... } from）。 */
const RE_EXPORT_RE = /\bexport\b\s+(?:type\s+)?(?:\*\s*(?:as\s+[\w$]+\s*)?|\{[^}]*\})\s+from\s+["']([^"']+)["']/g;

// ============================================================
// 输入 / 输出契约
// ============================================================

/** 被扫描文件（内容注入——本模块零 fs；path 为调用方归一后的相对 posix 路径）。 */
export interface ImportGraphFileInput {
  readonly path: string;
  readonly content: string;
}

/** tsconfig/jsconfig paths 的纯数据投影（pattern/targets 均为仓库相对 posix 词形）。 */
export interface ImportGraphPathAlias {
  readonly pattern: string;
  readonly targets: readonly string[];
}

/** analyzeImportGraph 输入。mapping = 相对路径 → governed id（调用方申报的分母面）。 */
export interface ImportGraphInput {
  readonly files: readonly ImportGraphFileInput[];
  /** 相对路径（posix）→ governed id；值非法（不过 A5 文法）= SCHEMA_INVALID 整体拒绝。 */
  readonly mapping: Readonly<Record<string, string>>;
  /** 可选路径别名；缺席保持旧行为。 */
  readonly pathAliases?: readonly ImportGraphPathAlias[];
  /** 源快照锚（sha256:<64hex>——结论对哪个源快照成立，§148/§132）。 */
  readonly sourceSha: string;
}

/** CALLS 边提案（不落盘——登记由消费方经 relations.registerRelation 显式执行）。 */
export interface ImportGraphEdgeProposal {
  /** 调用方 governed id（mapping[sourcePath]）。 */
  readonly source: string;
  /** 被调用方 governed id（mapping[候选命中键]）。 */
  readonly target: string;
  readonly type: typeof IMPORT_EDGE_TYPE;
  /** 源定位（源文件相对路径——批次 2 规格锚；行级定位归后续批次）。 */
  readonly locator: string;
}

/** 未解析引用行（unmapped 清单；禁静默丢弃——每条都进 report.unresolved_constructs）。 */
export interface ImportGraphUnmappedRow {
  /** 引用发起文件（相对 posix 路径）。 */
  readonly source: string;
  /** 原始 import 词面。 */
  readonly specifier: string;
  /** 未解析原因：源文件未登记 mapping（不产边）/ 目标候选全部未命中。 */
  readonly reason: "source_not_mapped" | "target_unresolved";
}

/**
 * Brownfield 文件路径候选：源码文件集内可解析的相对 import。
 *
 * 这不是 governed relation，也没有 relation type；消费方必须先把路径映射到已存在的
 * governed id，再决定是否按正常关系登记通路提交。它只让旧项目的真实源码连接可审查。
 */
export interface ImportGraphPathCandidate {
  readonly source: string;
  readonly target: string;
  readonly specifier: string;
}

/** 扫描文件集内无法定位目标的相对 import；与 governed-id 映射缺失分开披露。 */
export interface ImportGraphPathUnresolvedRow {
  readonly source: string;
  readonly specifier: string;
  readonly reason:
    | "target_not_found_in_scanned_files"
    | "alias_target_not_found_in_scanned_files";
}

/** 任务范围审查中的可达方向；root 行是声明起点自身（depth=0）。 */
export type ImportGraphScopeDirection = "root" | "dependency" | "consumer";

/**
 * Brownfield 路径候选上的范围审查行。每行保留声明根、遍历方向、最短深度和直接来源边；
 * 这是机器派生候选，不是 canonical relation、Task scope 或 Permit 成员。
 */
export interface ImportGraphScopeCandidate {
  readonly root: string;
  readonly direction: ImportGraphScopeDirection;
  readonly path: string;
  readonly depth: number;
  readonly via: ImportGraphPathCandidate | null;
}

/** 双向、有界路径闭包的纯函数输入。 */
export interface ImportGraphScopeReviewInput {
  readonly roots: readonly string[];
  readonly pathCandidates: readonly ImportGraphPathCandidate[];
  /** 允许展开的最大边深度；CLI 契约为 1..16。 */
  readonly maxDepth: number;
}

/** 双向范围候选投影；truncated 仅在边界外确有尚未展开节点时为 true。 */
export interface ImportGraphScopeReviewResult {
  readonly roots: readonly string[];
  readonly candidates: readonly ImportGraphScopeCandidate[];
  readonly truncated: boolean;
}

/** analyzeImportGraph 输出（report 已过 §148 判卷；边提案零落盘）。 */
export interface ImportGraphResult {
  /** §148 八字段报告（confidence=unmapped 空 ? deterministic : probable）。 */
  readonly report: AnalyzerReport;
  /** CALLS 边提案（(source,target) 去重；(source,target,locator) 字典序确定性）。 */
  readonly edges: readonly ImportGraphEdgeProposal[];
  /** 裸引用（包名）import 计数（不进边、不进 unmapped——外部依赖面只计数）。 */
  readonly externalImports: number;
  /** 命中 paths alias 的 import 数（无论物理目标是否解析成功）。 */
  readonly aliasImports: number;
  readonly aliasResolvedImports: number;
  readonly aliasUnresolvedImports: number;
  /** 未解析引用清单（=report.unresolved_constructs 的结构化形态）。 */
  readonly unmapped: readonly ImportGraphUnmappedRow[];
  /** 可审查的源码路径候选；零 relation 登记、零 governed id 创建。 */
  readonly pathCandidates: readonly ImportGraphPathCandidate[];
  /** 在扫描文件集内找不到目标的相对 import。 */
  readonly pathUnresolved: readonly ImportGraphPathUnresolvedRow[];
}

// ============================================================
// 扫描面（纯函数零 IO 零墙钟——同输入重放字节稳定，A4）
// ============================================================

/**
 * import 静态扫描主入口（analyze-only：零写通路，产出提案不落盘）。
 * 逐文件（path 字典序）扫两条 import 正则 → 相对引用以源文件目录折叠为仓库相对
 * 路径后按候选后缀序归一（首个命中 mapping 者胜）→ 边提案；裸引用计数
 * externalImports；全部候选未命中或源文件未登记 → unmapped 清单（fail-closed
 * 披露，禁静默丢弃）。mapping 值在入口整体校验（不过 governed id 文法 →
 * SCHEMA_INVALID——坏映射整体拒绝，禁静默跳过坏条目）。空 files 是合法输入
 * （零分母显式呈现于 report）。
 */
export function analyzeImportGraph(input: ImportGraphInput): ImportGraphResult {
  for (const [path, id] of Object.entries(input.mapping)) {
    try {
      parseGovernedId(id);
    } catch (error) {
      if (error instanceof GovernedIdParseError) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `mapping 值不过 governed id 文法（A5 closed-world）: ${path} → ${id}（${error.message}）`,
          "mapping 值是边提案端点身份；坏条目整体拒绝（禁静默跳过——静默 = 边端点身份失真）",
          { path, id },
        );
      }
      throw error;
    }
  }

  const sorted = [...input.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const edges: ImportGraphEdgeProposal[] = [];
  const edgeSeen = new Set<string>();
  const unmapped: ImportGraphUnmappedRow[] = [];
  const pathCandidates: ImportGraphPathCandidate[] = [];
  const pathCandidateSeen = new Set<string>();
  const pathUnresolved: ImportGraphPathUnresolvedRow[] = [];
  const mappedPaths = new Set(Object.keys(input.mapping));
  const scannedPaths = new Set(sorted.map((file) => file.path));
  const pathAliases = normalizePathAliases(input.pathAliases ?? []);
  let externalImports = 0;
  let aliasImports = 0;
  let aliasResolvedImports = 0;
  let aliasUnresolvedImports = 0;
  let objectsResolved = 0;

  for (const file of sorted) {
    const sourceId = hasOwn(input.mapping, file.path) ? input.mapping[file.path] : undefined;
    if (sourceId !== undefined) objectsResolved += 1;
    for (const specifier of scanImportSpecifiers(file.content)) {
      const relative = isRelativeSpecifier(specifier);
      const aliasBases = relative ? null : resolveAliasBases(specifier, pathAliases);
      if (!relative && aliasBases === null) {
        // 未命中内部 alias 的裸引用视为外部包——不进边、不进 unmapped。
        externalImports += 1;
        continue;
      }
      if (aliasBases !== null) aliasImports += 1;
      const repoRelativeBases = relative
        ? [joinFromSourceDir(file.path, specifier)]
        : aliasBases?.targets ?? [];
      const pathTarget = resolveFirstCandidate(repoRelativeBases, scannedPaths);
      if (pathTarget === null) {
        if (aliasBases !== null) aliasUnresolvedImports += 1;
        pathUnresolved.push({
          source: file.path,
          specifier,
          reason:
            aliasBases === null
              ? "target_not_found_in_scanned_files"
              : "alias_target_not_found_in_scanned_files",
        });
      } else {
        if (aliasBases !== null) aliasResolvedImports += 1;
        const pathCandidateKey = `${file.path}|${pathTarget}|${specifier}`;
        if (!pathCandidateSeen.has(pathCandidateKey)) {
          pathCandidateSeen.add(pathCandidateKey);
          pathCandidates.push({ source: file.path, target: pathTarget, specifier });
        }
      }
      const targetKey = resolveFirstCandidate(repoRelativeBases, mappedPaths);
      if (targetKey === null) {
        unmapped.push({ source: file.path, specifier, reason: "target_unresolved" });
        continue;
      }
      if (sourceId === undefined) {
        // 源文件未登记 mapping：目标可解析但无 source 身份——不产边也不静默丢。
        unmapped.push({ source: file.path, specifier, reason: "source_not_mapped" });
        continue;
      }
      const targetId = input.mapping[targetKey] as string;
      const dedupeKey = `${sourceId}|${targetId}`;
      if (edgeSeen.has(dedupeKey)) continue;
      edgeSeen.add(dedupeKey);
      edges.push({ source: sourceId, target: targetId, type: IMPORT_EDGE_TYPE, locator: file.path });
    }
  }

  edges.sort(
    (a, b) =>
      (a.source < b.source ? -1 : a.source > b.source ? 1 : 0) ||
      (a.target < b.target ? -1 : a.target > b.target ? 1 : 0) ||
      (a.locator < b.locator ? -1 : a.locator > b.locator ? 1 : 0),
  );
  pathCandidates.sort(
    (a, b) =>
      (a.source < b.source ? -1 : a.source > b.source ? 1 : 0) ||
      (a.target < b.target ? -1 : a.target > b.target ? 1 : 0) ||
      (a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0),
  );
  pathUnresolved.sort(
    (a, b) =>
      (a.source < b.source ? -1 : a.source > b.source ? 1 : 0) ||
      (a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0),
  );

  const report = normalizeAnalyzerReport({
    analyzer: ANALYZER_IMPORT_GRAPH_ID,
    scannedScope: `import-scan:${sorted.length}-files`,
    objectsResolved,
    relationsResolved: edges.length,
    unresolvedConstructs: unmapped.map(
      (row) => `${row.source} -> ${row.specifier} (${row.reason})`,
    ),
    parseFailures: [],
    confidence: unmapped.length === 0 ? "deterministic" : "probable",
    sourceSha: input.sourceSha,
  });

  return {
    report,
    edges,
    externalImports,
    aliasImports,
    aliasResolvedImports,
    aliasUnresolvedImports,
    unmapped,
    pathCandidates,
    pathUnresolved,
  };
}

/**
 * 从已解析源码路径候选派生任务范围审查投影。
 *
 * 每个声明根分别沿 source→target 求 dependency，沿 target→source 求 consumer；环按
 * (root,direction) visited 截断，菱形按排序后的首条最短路径确定 via。重复 roots 和
 * 重复边先归一，因此同输入重放字节稳定。函数只返回数据，不读写 store 或 relation。
 */
export function deriveImportGraphScopeReview(
  input: ImportGraphScopeReviewInput,
): ImportGraphScopeReviewResult {
  if (!Number.isInteger(input.maxDepth) || input.maxDepth < 1 || input.maxDepth > 16) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `import graph scope review maxDepth 必须是 1..16 的整数：${String(input.maxDepth)}`,
      "使用 1..16 的整数；默认深度由调用方选择（CLI 默认 4）。",
      { maxDepth: input.maxDepth },
    );
  }

  const roots = [...new Set(input.roots)].sort();
  const edges = dedupePathCandidates(input.pathCandidates);
  const outgoing = adjacencyOf(edges, "dependency");
  const incoming = adjacencyOf(edges, "consumer");
  const candidates: ImportGraphScopeCandidate[] = roots.map((root) => ({
    root,
    direction: "root" as const,
    path: root,
    depth: 0,
    via: null,
  }));
  let truncated = false;

  for (const root of roots) {
    for (const direction of ["dependency", "consumer"] as const) {
      const adjacency = direction === "dependency" ? outgoing : incoming;
      const visited = new Set<string>([root]);
      let frontier: readonly string[] = [root];
      for (let depth = 1; depth <= input.maxDepth && frontier.length > 0; depth += 1) {
        const next: string[] = [];
        for (const current of frontier) {
          for (const edge of adjacency.get(current) ?? []) {
            const path = direction === "dependency" ? edge.target : edge.source;
            if (visited.has(path)) continue;
            visited.add(path);
            candidates.push({ root, direction, path, depth, via: edge });
            next.push(path);
          }
        }
        frontier = [...new Set(next)].sort();
      }
      if (frontier.some((current) =>
        (adjacency.get(current) ?? []).some((edge) => {
          const path = direction === "dependency" ? edge.target : edge.source;
          return !visited.has(path);
        }),
      )) {
        truncated = true;
      }
    }
  }

  candidates.sort(compareScopeCandidate);
  return { roots, candidates, truncated };
}

// ============================================================
// 内部共享
// ============================================================

/** 逐文件收集 import/re-export 词面；无注释剔除——模块头边界。 */
function scanImportSpecifiers(content: string): readonly string[] {
  const specifiers: string[] = [];
  for (const match of content.matchAll(STATIC_IMPORT_RE)) {
    specifiers.push(match[1] ?? "");
  }
  for (const match of content.matchAll(DYNAMIC_IMPORT_RE)) {
    specifiers.push(match[1] ?? "");
  }
  for (const match of content.matchAll(RE_EXPORT_RE)) {
    specifiers.push(match[1] ?? "");
  }
  return specifiers;
}

/** 相对引用判定（./ 或 ../ 开头；其余按包名裸引用处置）。 */
function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

/**
 * 以源文件目录折叠相对引用为仓库相对 posix 路径（posix 语义消解 ./ ../——
 * 纯字符串折叠零依赖；`..` 越出根的段直接丢弃，与 posix.join 容错语义同向）。
 */
function joinFromSourceDir(sourcePath: string, specifier: string): string {
  const cut = sourcePath.lastIndexOf("/");
  const baseDir = cut >= 0 ? sourcePath.slice(0, cut) : "";
  const segments: string[] = baseDir === "" ? [] : baseDir.split("/");
  for (const segment of specifier.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

/** 相对引用候选归一（批次 2 规格序：原样/.ts/.tsx/.vue/.js//index.ts——首个命中 mapping 者胜）。 */
function resolveRelativeCandidate(
  repoRelative: string,
  knownPaths: ReadonlySet<string>,
): string | null {
  for (const suffix of RELATIVE_IMPORT_CANDIDATE_SUFFIXES) {
    const candidate = `${repoRelative}${suffix}`;
    if (knownPaths.has(candidate)) return candidate;
  }
  return null;
}

function resolveFirstCandidate(
  repoRelativeBases: readonly string[],
  knownPaths: ReadonlySet<string>,
): string | null {
  for (const base of repoRelativeBases) {
    const resolved = resolveRelativeCandidate(base, knownPaths);
    if (resolved !== null) return resolved;
  }
  return null;
}

function dedupePathCandidates(
  input: readonly ImportGraphPathCandidate[],
): readonly ImportGraphPathCandidate[] {
  const byKey = new Map<string, ImportGraphPathCandidate>();
  for (const edge of input) {
    const key = `${edge.source}\u0000${edge.target}\u0000${edge.specifier}`;
    if (!byKey.has(key)) byKey.set(key, edge);
  }
  return [...byKey.values()].sort(comparePathCandidate);
}

function adjacencyOf(
  edges: readonly ImportGraphPathCandidate[],
  direction: "dependency" | "consumer",
): ReadonlyMap<string, readonly ImportGraphPathCandidate[]> {
  const out = new Map<string, ImportGraphPathCandidate[]>();
  for (const edge of edges) {
    const key = direction === "dependency" ? edge.source : edge.target;
    const bucket = out.get(key) ?? [];
    bucket.push(edge);
    out.set(key, bucket);
  }
  for (const bucket of out.values()) bucket.sort(comparePathCandidate);
  return out;
}

function comparePathCandidate(a: ImportGraphPathCandidate, b: ImportGraphPathCandidate): number {
  return (
    (a.source < b.source ? -1 : a.source > b.source ? 1 : 0) ||
    (a.target < b.target ? -1 : a.target > b.target ? 1 : 0) ||
    (a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0)
  );
}

function compareScopeCandidate(a: ImportGraphScopeCandidate, b: ImportGraphScopeCandidate): number {
  const directionRank = { root: 0, dependency: 1, consumer: 2 } as const;
  return (
    (a.root < b.root ? -1 : a.root > b.root ? 1 : 0) ||
    directionRank[a.direction] - directionRank[b.direction] ||
    a.depth - b.depth ||
    (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) ||
    compareNullablePathCandidate(a.via, b.via)
  );
}

function compareNullablePathCandidate(
  a: ImportGraphPathCandidate | null,
  b: ImportGraphPathCandidate | null,
): number {
  if (a === null) return b === null ? 0 : -1;
  if (b === null) return 1;
  return comparePathCandidate(a, b);
}

interface NormalizedPathAlias {
  readonly pattern: string;
  readonly targets: readonly string[];
  readonly prefix: string;
  readonly suffix: string;
  readonly wildcard: boolean;
}

function normalizePathAliases(input: readonly ImportGraphPathAlias[]): readonly NormalizedPathAlias[] {
  return input
    .filter((row) => row.pattern.length > 0 && row.targets.length > 0)
    .map((row) => {
      const star = row.pattern.indexOf("*");
      return {
        pattern: row.pattern,
        targets: [...row.targets],
        prefix: star === -1 ? row.pattern : row.pattern.slice(0, star),
        suffix: star === -1 ? "" : row.pattern.slice(star + 1),
        wildcard: star !== -1,
      };
    })
    .sort(
      (a, b) =>
        Number(a.wildcard) - Number(b.wildcard) ||
        b.prefix.length - a.prefix.length ||
        b.suffix.length - a.suffix.length ||
        (a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : 0),
    );
}

function resolveAliasBases(
  specifier: string,
  aliases: readonly NormalizedPathAlias[],
): { readonly pattern: string; readonly targets: readonly string[] } | null {
  for (const alias of aliases) {
    if (!alias.wildcard) {
      if (specifier === alias.pattern) return { pattern: alias.pattern, targets: alias.targets };
      continue;
    }
    if (!specifier.startsWith(alias.prefix) || !specifier.endsWith(alias.suffix)) continue;
    const capture = specifier.slice(alias.prefix.length, specifier.length - alias.suffix.length);
    return {
      pattern: alias.pattern,
      targets: alias.targets
        .map((target) => normalizeAliasTarget(target.replace("*", capture)))
        .filter((target): target is string => target !== null),
    };
  }
  return null;
}

function normalizeAliasTarget(input: string): string | null {
  const segments: string[] = [];
  for (const segment of input.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

/** mapping 键存在性（Object 原型键免疫——禁 "toString" 等原型词形误命中）。 */
function hasOwn(record: Readonly<Record<string, string>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
