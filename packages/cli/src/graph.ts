/**
 * graph.ts —— `pomaster graph <governed-id>`：对象图视图命令（P-v06 批次 4）。
 *
 * PRD §104-113 Studio 信息架构的最小 CLI 投影 + §111 Trace Everything 的读侧命令面。
 * 「所有可视化都是 Projection」（§1.6）——本命令是纯读派生视图，零写入（执行前后
 * .pomaster 字节不变，测试锚）。纪律落点：
 * - 纯读零写入（A1 出口判据）：不调 createStore（其 ensureSidecars 会补写缺失骨架
 *   文件）——装载走 kernel loadStoreReadOnly（与 createStore 同源校验、零写副作用，
 *   pure-read-zero-write.spec H3 先例）；未 init → NOT_CONFIGURED fail-closed 带 init
 *   路标（「没查」≠「空图」，resolve 同款纪律）；relations 台账损坏 → SCHEMA_INVALID
 *   fail-closed（禁静默当空图）；
 * - 判卷权威在 kernel（CLI 分层纪律）：图数据全部经 kernel 纯函数派生——familyOfId
 *   （§6.1 family 派生视图）/ relationsTouching / forwardDependencies /
 *   reverseDependents（§106-108 Change Impact 最小算子）/ impactClosure（反向 BFS，
 *   maxDepth 缺省 4，超深 max_depth_reached 显式呈现禁静默）；本模块只做编排与呈现，
 *   零 kernel 源码改动；
 * - 端点存在性不在本面判卷（§6 关系面纪律「本面只解析命名，存在性归消费面」）——
 *   边照登记呈现，不做 REF_INTEGRITY 式对账（检视零旁移，inspect 同款）；
 * - INSTANCE_OF 采纳边单列（§84 解析≠采用：采纳边是显式登记事实，专段呈现；正向依赖
 *   分组排除 INSTANCE_OF 避免同边双呈现——呈现层派生决策，kernel 函数照常复用；
 *   采纳边谓词与 kernel instanceOfEdgesPresent 等价，本面保留整边字段供呈现）。
 *   有意不对称：反向 dependents 不排除 INSTANCE_OF——单列只针对本对象出边的采纳
 *   事实，入边照登记全呈现（反向完整性优先，禁在影响方向藏边）；
 * - 空态显式（NO_MATCH 纪律）：零边 = 「无边登记」，不冒充「无依赖/无影响面」——
 *   登记缺席 ≠ 事实缺席，措辞显式披露分母（.pomaster/state/relations.jsonl）；
 * - 确定性：机读/人读双形态排序全部确定（type 字典序分组、组内 (domain,id) 字典序、
 *   闭包序归 kernel impactClosure (depth,domain,id)），同 store 同 id 重跑字节一致。
 */

import { readFile } from "node:fs/promises";
import {
  familyOfId,
  forwardDependencies,
  GovernanceError,
  GovernedIdParseError,
  impactClosure,
  loadStoreReadOnly,
  parseGovernedId,
  pathsOf,
  readRelations,
  relationsTouching,
  RELATIONS_RELATIVE,
  reverseDependents,
  type ImpactClosure,
  type ObjectFamilyValue,
  type RelationEntry,
  type RelationTypeValue,
} from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, parseErrorToCliError } from "./permit.js";
import { toPosix, truthIndexPath, TRUTH_INDEX_RELATIVE } from "./store-layout.js";

type UnknownRecord = Record<string, unknown>;

/** impact 闭包缺省深度（kernel impactClosure 同缺省；防御环失控 BFS）。 */
export const DEFAULT_IMPACT_DEPTH = 4;

/** `pomaster graph` 输入（argv 词形未收敛字符串；词形闸在 runGraph 单点判卷）。 */
export interface GraphInput {
  readonly id: string;
  /** 视图词形（all=全段（缺省）| impact=只出 impact 闭包段；词表外 SCHEMA_INVALID）。 */
  readonly view?: string;
  /** 闭包深度词形（数字字符串；词形非法 SCHEMA_INVALID；域校验 1..16 归 kernel）。 */
  readonly maxDepth?: string;
  readonly rootDir: string;
}

/** 边呈现条目（endpoint = 对端；正向=边 target / 反向=边 source）。 */
export interface GraphEdgeView {
  readonly edge_id: string;
  readonly endpoint: { readonly domain: string; readonly id: string };
  readonly origin: string;
  readonly confidence: string;
  readonly producer: string;
}

/** 按 relation_type 分组的边段（type 字典序；组内 (domain,id) 字典序）。 */
export interface GraphEdgeGroup {
  readonly type: RelationTypeValue;
  readonly edges: readonly GraphEdgeView[];
}

/** 对象行（truth-index 查册 id/kind/titleZh/axes + familyOfId 派生 family）。 */
export interface GraphObjectRow {
  readonly id: string;
  readonly kind: string | null;
  readonly title_zh: string | null;
  readonly family: ObjectFamilyValue;
  readonly axes: Readonly<UnknownRecord> | null;
}

/** impact 闭包段（kernel ImpactClosure 的 CLI 投影；max_depth_reached 显式呈现）。 */
export interface GraphImpactView {
  readonly root: { readonly domain: string; readonly id: string };
  readonly affected: readonly {
    readonly domain: string;
    readonly id: string;
    readonly depth: number;
    readonly via_edge_id: string;
    readonly via_edge_type: string;
  }[];
  readonly max_depth_reached: boolean;
}

/** graph 命令机读面（§45 --json 信封 result 位）。impact 视图只出闭包段——
 *  object/instance_of/forward/reverse 为 null（显式未请求，非「查了没有」）；失败路径
 *  impact=null（缺席显式，不伪造空闭包）。 */
export interface GraphResult {
  readonly id: string;
  readonly view: "all" | "impact";
  readonly max_depth: number;
  readonly object: GraphObjectRow | null;
  /** 触达本对象的边登记总数（relationsTouching；INSTANCE_OF 计入）。 */
  readonly relations_touching: number | null;
  readonly instance_of: readonly GraphEdgeView[] | null;
  readonly forward_dependencies: readonly GraphEdgeGroup[] | null;
  readonly reverse_dependents: readonly GraphEdgeGroup[] | null;
  readonly impact: GraphImpactView | null;
}

const RELATIONS_NOTE = `登记面 ${RELATIONS_RELATIVE}`;

// ============================================================
// 渲染（人读确定性；机读唯一接口是 --json 信封——禁彩色自然语言当机读接口）
// ============================================================

function renderEdgeLine(edge: GraphEdgeView, arrow: "→" | "←"): string {
  return (
    `      - ${edge.edge_id} ${arrow} ${edge.endpoint.domain}:${edge.endpoint.id}` +
    `（origin=${edge.origin} confidence=${edge.confidence} producer=${edge.producer}）`
  );
}

function renderEdgeGroups(
  label: string,
  groups: readonly GraphEdgeGroup[],
  arrow: "→" | "←",
): string[] {
  const total = groups.reduce((sum, group) => sum + group.edges.length, 0);
  if (total === 0) {
    return [`  ${label}: (无边登记——零边≠无依赖；${RELATIONS_NOTE})`];
  }
  const lines = [`  ${label}: ${total} 条`];
  for (const group of groups) {
    lines.push(`    ${group.type}: ${group.edges.length} 条`);
    for (const edge of group.edges) lines.push(renderEdgeLine(edge, arrow));
  }
  return lines;
}

/** 人读呈现（确定性排序；空态显式「无边登记」，不冒充无依赖）。 */
export function renderGraph(result: GraphResult): readonly string[] {
  const lines: string[] = [];
  if (result.object !== null) {
    lines.push(
      `graph ${result.object.id} → family=${result.object.family} kind=${result.object.kind ?? "?"}`,
    );
    lines.push(`  title: ${result.object.title_zh ?? "(missing)"}`);
    if (result.object.axes !== null) {
      lines.push(`  axes: ${JSON.stringify(result.object.axes)}`);
    }
    lines.push(
      result.relations_touching === 0
        ? `  relations: (无边登记——零边≠无依赖；${RELATIONS_NOTE})`
        : `  relations: ${result.relations_touching} 条边登记（touching 本对象）`,
    );
  } else {
    lines.push(`graph ${result.id}（view=impact，只出闭包段）`);
  }
  if (result.instance_of !== null) {
    if (result.instance_of.length === 0) {
      lines.push(`  instance_of: (无边登记——采纳边缺席≠未采用声明；${RELATIONS_NOTE})`);
    } else {
      lines.push(`  instance_of: ${result.instance_of.length} 条采纳边`);
      for (const edge of result.instance_of) {
        lines.push(
          `    - ${edge.edge_id} → ${edge.endpoint.domain}:${edge.endpoint.id}` +
            `（origin=${edge.origin} confidence=${edge.confidence} producer=${edge.producer}）`,
        );
      }
    }
  }
  if (result.forward_dependencies !== null) {
    lines.push(
      ...renderEdgeGroups(
        "forward dependencies（正向依赖）",
        result.forward_dependencies,
        "→",
      ),
    );
  }
  if (result.reverse_dependents !== null) {
    lines.push(
      ...renderEdgeGroups(
        "reverse dependents（反向 dependents）",
        result.reverse_dependents,
        "←",
      ),
    );
  }
  if (result.impact !== null) {
    if (result.impact.affected.length === 0) {
      lines.push(
        `  impact 邻域（max_depth=${result.max_depth}）: (无边登记——零入边≠无影响面；${RELATIONS_NOTE})`,
      );
    } else {
      lines.push(
        `  impact 邻域（max_depth=${result.max_depth}）: affected=${result.impact.affected.length}` +
          ` max_depth_reached=${result.impact.max_depth_reached}`,
      );
      for (const node of result.impact.affected) {
        lines.push(
          `    - depth=${node.depth} ${node.domain}:${node.id} via ${node.via_edge_type} ${node.via_edge_id}`,
        );
      }
    }
  }
  return lines;
}

// ============================================================
// 编排（判卷权威在 kernel；本模块零旁移）
// ============================================================

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function failGraph(error: CliError, skeleton: GraphResult): CommandOutcome<GraphResult> {
  return failOutcome("graph", skeleton, [error], [
    `graph: FAILED — ${error.code}\n  hint: ${error.hint}`,
  ]);
}

/** kernel 异常的统一信封翻译（GovernanceError 码位透传 / 其他显式 KERNEL_ERROR）。 */
function kernelErrorToCliError(error: unknown): CliError {
  if (error instanceof GovernanceError) return governanceErrorToCliError(error);
  return {
    code: "KERNEL_ERROR",
    message: error instanceof Error ? error.message : String(error),
    hint: "查看 docs/kernel-api.md 对应契约；若为环境异常请勿静默降级。",
  };
}

/** 失败路径的空结果（缺席显式——不伪造对象行/边/闭包）。 */
function emptyResult(id: string, view: "all" | "impact", maxDepth: number): GraphResult {
  return {
    id,
    view,
    max_depth: maxDepth,
    object: null,
    relations_touching: null,
    instance_of: null,
    forward_dependencies: null,
    reverse_dependents: null,
    impact: null,
  };
}

function byEndpoint(
  a: GraphEdgeView,
  b: GraphEdgeView,
): number {
  if (a.endpoint.domain !== b.endpoint.domain) {
    return a.endpoint.domain < b.endpoint.domain ? -1 : 1;
  }
  return a.endpoint.id < b.endpoint.id ? -1 : 1;
}

/** relation_type 分组（type 字典序；组内 (domain,id) 字典序——同 store 重跑字节一致）。 */
function groupEdgesByType(
  entries: readonly RelationEntry[],
  otherEnd: (entry: RelationEntry) => { readonly domain: string; readonly id: string },
): GraphEdgeGroup[] {
  const groups = new Map<RelationTypeValue, GraphEdgeView[]>();
  for (const entry of entries) {
    const view: GraphEdgeView = {
      edge_id: entry.edge_id,
      endpoint: otherEnd(entry),
      origin: entry.origin,
      confidence: entry.confidence,
      producer: entry.producer,
    };
    const list = groups.get(entry.type);
    if (list === undefined) groups.set(entry.type, [view]);
    else list.push(view);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([type, edges]) => ({ type, edges: edges.sort(byEndpoint) }));
}

/**
 * 执行 graph（纯读零写入）。ok=false 仅在对象不可诚实呈现时（未初始化/id 文法非法/
 * 对象缺席/索引或台账损坏/argv 词形非法）；空态（零边）是合法显式输出不是失败。
 */
export async function runGraph(input: GraphInput): Promise<CommandOutcome<GraphResult>> {
  // —— argv 词形收敛（输入缺陷先行 fail-closed；词表外显式拒绝，非静默吞参） ——
  const view = input.view ?? "all";
  if (view !== "all" && view !== "impact") {
    return failGraph(
      {
        code: "SCHEMA_INVALID",
        message: `--view 词表外：${view}（合法词形：all | impact）`,
        hint: "all=对象行+采纳边+正/反向依赖+impact 邻域（缺省）；impact=只出闭包段。",
      },
      emptyResult(input.id, "all", DEFAULT_IMPACT_DEPTH),
    );
  }
  let maxDepth = DEFAULT_IMPACT_DEPTH;
  if (input.maxDepth !== undefined) {
    const raw = input.maxDepth.trim();
    if (!/^[0-9]+$/.test(raw)) {
      return failGraph(
        {
          code: "SCHEMA_INVALID",
          message: `--max-depth 词形非法：${input.maxDepth}（须非负整数字符串）`,
          hint: "深度域校验（1..16）归 kernel impactClosure——防御失控 BFS。",
        },
        emptyResult(input.id, view, DEFAULT_IMPACT_DEPTH),
      );
    }
    maxDepth = Number.parseInt(raw, 10);
  }

  // —— store 装载（loadStoreReadOnly：零写副作用；未 init → NOT_CONFIGURED 带 init 路标） ——
  let store: ReturnType<typeof loadStoreReadOnly>;
  try {
    store = loadStoreReadOnly(input.rootDir);
  } catch (error) {
    if (error instanceof GovernanceError && error.code === "NOT_CONFIGURED") {
      return failGraph(
        {
          code: "NOT_CONFIGURED",
          message: error.message,
          hint: "先跑 pomaster init 建骨架（graph 纯读消费 .pomaster/state；NOT_CONFIGURED 是状态缺席，不是空图——「没查」≠「查了没有」）。",
        },
        emptyResult(input.id, view, maxDepth),
      );
    }
    // as GovernanceError 断言（严格 tsc 清零；零运行时变更）：loadStoreReadOnly 的
    // 故障面全为 GovernanceError（kernel fail-closed 契约），NOT_CONFIGURED 已前置
    // 拦截，此处余量按同契约翻译（catch 形参 unknown 是 TS 无 distinguishable
    // catch 的既定形态，非运行时异型信号）。
    return failGraph(
      governanceErrorToCliError(error as GovernanceError),
      emptyResult(input.id, view, maxDepth),
    );
  }

  // —— id 文法（A5 closed-world FATAL 同契约；kernel 权威，CLI 不自造映射） ——
  try {
    parseGovernedId(input.id);
  } catch (error) {
    if (!(error instanceof GovernedIdParseError)) throw error;
    return failGraph(parseErrorToCliError(error), emptyResult(input.id, view, maxDepth));
  }
  const target = input.id;

  // —— truth-index 查册（对象缺席显式——闭包根不存在不得冒充空影响面） ——
  let indexRaw: string;
  try {
    indexRaw = await readFile(truthIndexPath(input.rootDir), "utf8");
  } catch {
    return failGraph(
      {
        code: "NOT_INITIALIZED",
        message: `no pomaster state found at ${toPosix(TRUTH_INDEX_RELATIVE)}`,
        hint: "run: pomaster init（在项目根创建治理骨架后重试）。",
      },
      emptyResult(target, view, maxDepth),
    );
  }
  let index: UnknownRecord;
  try {
    const parsed: unknown = JSON.parse(indexRaw);
    if (!isRecord(parsed)) throw new TypeError("truth-index is not an object");
    index = parsed;
  } catch (error) {
    return failGraph(
      {
        code: "SCHEMA_INVALID",
        message: `truth-index 无法解析：${(error as Error).message}`,
        hint: `机器事务维护的文件（${toPosix(TRUTH_INDEX_RELATIVE)}）；手改内容请走 kernel store 事务恢复。`,
      },
      emptyResult(target, view, maxDepth),
    );
  }
  const rows = Array.isArray(index.objects) ? index.objects : [];
  const row = rows.find((entry) => isRecord(entry) && entry.id === target);
  if (row === undefined) {
    return failGraph(
      {
        code: "OBJECT_NOT_FOUND",
        message: `对象不在 truth-index：${target}`,
        hint: "pomaster status --json 查看对象清单；id 词形见 vocab-lock id_namespace（A5）。",
      },
      emptyResult(target, view, maxDepth),
    );
  }
  const rowRecord = row as UnknownRecord;

  // —— relations 台账只读（损坏 → SCHEMA_INVALID fail-closed，禁静默当空图） ——
  let entries: readonly RelationEntry[];
  try {
    entries = readRelations(pathsOf(store));
  } catch (error) {
    return failGraph(kernelErrorToCliError(error), emptyResult(target, view, maxDepth));
  }

  // —— 视图派生（kernel 纯函数；零写入零第二事实面；域闸违规显式翻译禁裸崩） ——
  let derived: {
    readonly touching: readonly RelationEntry[];
    readonly instanceOfEdges: readonly GraphEdgeView[];
    readonly forwardGroups: readonly GraphEdgeGroup[];
    readonly reverseGroups: readonly GraphEdgeGroup[];
    readonly closure: ImpactClosure;
  };
  try {
    const endpoint = { domain: "truth", id: target } as const;
    const touching = relationsTouching(entries, endpoint);
    const forward = forwardDependencies(entries, endpoint);
    const reverse = reverseDependents(entries, endpoint);
    // INSTANCE_OF 采纳边单列（谓词与 kernel instanceOfEdgesPresent 等价；本面保留整边），
    // 正向依赖分组排除之——同边不双呈现（呈现层派生决策，kernel 函数照常复用）；
    // 反向分组不排除（有意不对称：单列只针对出边采纳事实，入边完整性优先——见头注）。
    const instanceOfEdges = forward
      .filter((entry) => entry.type === "INSTANCE_OF")
      .map((entry) => ({
        edge_id: entry.edge_id,
        endpoint: entry.target,
        origin: entry.origin,
        confidence: entry.confidence,
        producer: entry.producer,
      }))
      .sort(byEndpoint);
    const forwardGroups = groupEdgesByType(
      forward.filter((entry) => entry.type !== "INSTANCE_OF"),
      (entry) => entry.target,
    );
    const reverseGroups = groupEdgesByType(reverse, (entry) => entry.source);
    const closure = impactClosure(entries, endpoint, { maxDepth });
    derived = { touching, instanceOfEdges, forwardGroups, reverseGroups, closure };
  } catch (error) {
    return failGraph(kernelErrorToCliError(error), emptyResult(target, view, maxDepth));
  }

  const isAllView = view === "all";
  const result: GraphResult = {
    id: target,
    view,
    max_depth: maxDepth,
    object: isAllView
      ? {
          id: target,
          kind: asString(rowRecord.kind),
          title_zh: asString(rowRecord.title_zh),
          family: familyOfId(target),
          axes: isRecord(rowRecord.axes) ? (rowRecord.axes as UnknownRecord) : null,
        }
      : null,
    relations_touching: isAllView ? derived.touching.length : null,
    instance_of: isAllView ? derived.instanceOfEdges : null,
    forward_dependencies: isAllView ? derived.forwardGroups : null,
    reverse_dependents: isAllView ? derived.reverseGroups : null,
    impact: {
      root: derived.closure.root,
      affected: derived.closure.affected.map((node) => ({
        domain: node.endpoint.domain,
        id: node.endpoint.id,
        depth: node.depth,
        via_edge_id: node.via_edge_id,
        via_edge_type: node.via_edge_type,
      })),
      max_depth_reached: derived.closure.max_depth_reached,
    },
  };
  return okOutcome("graph", result, renderGraph(result));
}
