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
 * - 只扫静态 `import ... from '...'` 与动态 `import('...')` 两条正则：re-export
 *   （export ... from）、require()、CSS/模板内引用均不在扫描面（显式缺席非缺陷）；
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

/** 相对引用候选后缀序（首个命中 mapping 者胜；批次 2 规格——原样/.ts/.tsx/.vue/.js//index.ts）。 */
export const RELATIVE_IMPORT_CANDIDATE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".vue",
  ".js",
  "/index.ts",
] as const;

/** 静态 import 词面（含 type import / 具名/默认/命名空间/副作用裸导入；不含 import(）。 */
const STATIC_IMPORT_RE = /\bimport\b\s+(?:type\s+)?(?:[\w*{},\s$]+?\s+from\s+)?["']([^"']+)["']/g;

/** 动态 import 词面（import('...')；两条正则之一——模块头「已知边界」）。 */
const DYNAMIC_IMPORT_RE = /\bimport\b\s*\(\s*["']([^"']+)["']\s*\)/g;

// ============================================================
// 输入 / 输出契约
// ============================================================

/** 被扫描文件（内容注入——本模块零 fs；path 为调用方归一后的相对 posix 路径）。 */
export interface ImportGraphFileInput {
  readonly path: string;
  readonly content: string;
}

/** analyzeImportGraph 输入。mapping = 相对路径 → governed id（调用方申报的分母面）。 */
export interface ImportGraphInput {
  readonly files: readonly ImportGraphFileInput[];
  /** 相对路径（posix）→ governed id；值非法（不过 A5 文法）= SCHEMA_INVALID 整体拒绝。 */
  readonly mapping: Readonly<Record<string, string>>;
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

/** analyzeImportGraph 输出（report 已过 §148 判卷；边提案零落盘）。 */
export interface ImportGraphResult {
  /** §148 八字段报告（confidence=unmapped 空 ? deterministic : probable）。 */
  readonly report: AnalyzerReport;
  /** CALLS 边提案（(source,target) 去重；(source,target,locator) 字典序确定性）。 */
  readonly edges: readonly ImportGraphEdgeProposal[];
  /** 裸引用（包名）import 计数（不进边、不进 unmapped——外部依赖面只计数）。 */
  readonly externalImports: number;
  /** 未解析引用清单（=report.unresolved_constructs 的结构化形态）。 */
  readonly unmapped: readonly ImportGraphUnmappedRow[];
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
  let externalImports = 0;
  let objectsResolved = 0;

  for (const file of sorted) {
    const sourceId = hasOwn(input.mapping, file.path) ? input.mapping[file.path] : undefined;
    if (sourceId !== undefined) objectsResolved += 1;
    for (const specifier of scanImportSpecifiers(file.content)) {
      if (!isRelativeSpecifier(specifier)) {
        // 裸引用（包名）：外部依赖面只计数——不进边、不进 unmapped（批次 2 规格锚）。
        externalImports += 1;
        continue;
      }
      const targetKey = resolveRelativeCandidate(joinFromSourceDir(file.path, specifier), input.mapping);
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

  return { report, edges, externalImports, unmapped };
}

// ============================================================
// 内部共享
// ============================================================

/** 逐文件收集 import 词面（静态 + 动态两条正则按出现序合并；无注释剔除——模块头边界）。 */
function scanImportSpecifiers(content: string): readonly string[] {
  const specifiers: string[] = [];
  for (const match of content.matchAll(STATIC_IMPORT_RE)) {
    specifiers.push(match[1] ?? "");
  }
  for (const match of content.matchAll(DYNAMIC_IMPORT_RE)) {
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
  mapping: Readonly<Record<string, string>>,
): string | null {
  for (const suffix of RELATIVE_IMPORT_CANDIDATE_SUFFIXES) {
    const candidate = `${repoRelative}${suffix}`;
    if (hasOwn(mapping, candidate)) return candidate;
  }
  return null;
}

/** mapping 键存在性（Object 原型键免疫——禁 "toString" 等原型词形误命中）。 */
function hasOwn(record: Readonly<Record<string, string>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
