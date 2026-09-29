/**
 * impact-derive.ts —— 跨平面关系适配与派生影响闭包（W3 切片 FR-06；Case A 分母；
 * research dependency-authority-and-routing.md §4 方案 A「按消费者逐步接线」）。
 *
 * 定位红线（研究 §5 必守约束逐条落法）：
 * - **只读派生、零落盘**：四类接入关系（ADAPTED_RELATION_KINDS）由各自真实数据源
 *   （truth-index 对象 payload / discovery scratchpad decision-graph / generated 落盘
 *   产物输入声明 / contract-baseline 分母声明）在内存构建派生边，喂给与 relations.ts
 *   impactClosure 同构的反向 BFS——**不复制成第二 canonical graph、不建 ImpactGraph、
 *   不建第二依赖 store**（本模块纯函数零 IO 零写入，输出即算即弃）；
 * - **适配器覆盖分母显式**：闭包只证明已登记/已适配边的可达性——结构候选不自动晋升
 *   业务真值；未接入资产清单（UNADAPTED_ASSET_INVENTORY）随结果携带，「不能声称全仓
 *   完整」是合同的一部分而非免责声明；
 * - **截断图不冒充完整图**：maxDepth 缺省 4、域 1..16（impactClosure 同闸镜像）、
 *   max_depth_reached 显式 + 行级 truncated 标记（该行下游扩展被截断时为 true）；
 * - **unknown 显式不猜测**：悬空引用（depends_on 悬空 / source_ref 未登记 / affects
 *   宽松词形非 governed）不猜测升级为图节点，登记进 unresolved_refs 呈现；
 * - **身份面**：派生边 id 用 DXE-<12hex> 内容寻址（sha256OfCanonical({source,kind,
 *   target}) 前 12 hex，EDGE-<12hex> 同族词形法式）——与台账 EDGE- 词形刻意区分：
 *   台账边是登记事实（append-only 台账行），派生边是即时派生（非事实、不落盘、无
 *   provenance 五面），两词形不可互换（禁把派生边冒充登记边或反之）。
 *
 * 复用注记（为何不直接调 relations.ts impactClosure）：impactClosure 的入参端点类型
 * 锁死 RelationEndpoint（domain ∈ truth/catalog，truth 端点强制 governed id 文法），
 * 而 DECISION.*（Discovery 局部词形）、sources id（bp-carline 词形）、generated 产物
 * id（文件名词形）都不受该文法管辖——为不改动已冻结的 relations 合同（19 schema 镜像
 * 面），本模块以同构 BFS 镜像其判定语义：同 maxDepth 闸、同 visited（首次到达即最浅，
 * 菱形去重）、同 (depth, domain, id) 确定性排序、同 max_depth_reached 截断披露。台账边
 * （EDGE-）原样进入同一 BFS—— relations/reverseDependents 的反向语义在本闭包内零漂移。
 */
import { GovernanceError, GovernedIdParseError } from "./errors.js";
import { sha256OfCanonical } from "./digest.js";
import { parseGovernedId } from "./id.js";
import type { RelationEntry } from "./relations.js";

// ============================================================
// 词形（平面闭包 + 接入清单 + 未接入资产清单）
// ============================================================

/**
 * 影响平面五值闭包：truth/catalog = 台账边两域（19 schema relation_endpoint_domain
 * 归一）；discovery = DECISION.*（Discovery 局部词形）；generated = 落盘产物 manifest
 * 词形；source = sources/index.yaml 来源 id 词形。开放扩值走本闭包定稿（禁调用侧私扩）。
 */
export const IMPACT_PLANE_VALUES = [
  "truth",
  "catalog",
  "discovery",
  "generated",
  "source",
] as const;
export type ImpactPlaneValue = (typeof IMPACT_PLANE_VALUES)[number];

/**
 * 接入关系类型清单（W3 交付物之一；四类各有真实数据源，kind 词形是派生边元数据）：
 * - PAYLOAD_SOURCE_REF：对象 payload.source_refs → 来源（数据源：truth-index 对象行 +
 *   正文 payload.source_refs 自由区）；
 * - DECISION_DEPENDS_ON：Decision 节点 depends_on（数据源：discovery scratchpad
 *   decision-graph sidecar 的 decisions[].depends_on / affects）；
 * - GENERATED_INPUT_REF：generated 产物声明的输入引用（数据源：state/contexts manifest
 *   等落盘产物的 inputs 声明——消费侧 freshness 见 invalidation.ts）；
 * - CONTRACT_BASELINE_REF：contract/baseline 分母（数据源：对象 denominator_refs + 任务
 *   implements_change 链）。
 */
export const ADAPTED_RELATION_KINDS = [
  "PAYLOAD_SOURCE_REF",
  "DECISION_DEPENDS_ON",
  "GENERATED_INPUT_REF",
  "CONTRACT_BASELINE_REF",
] as const;
export type AdaptedRelationKind = (typeof ADAPTED_RELATION_KINDS)[number];

/**
 * 未接入资产诚实清单（W3 交付物之一；「不能声称全仓完整」的结构化承载——每条豁免
 * 注明理由与既有归属面）。闭包结果的 unadapted_assets 原样携带本清单。
 */
export const UNADAPTED_ASSET_INVENTORY: readonly string[] = [
  "analyzer CALLS/READS 边提案中未登记部分（registerRelation 落账前只是提案——已登记部分经 relations 台账边自然在本闭包分母内）",
  "evidence 证据平面（GRN run / CLM claim 的 subject 绑定是资格面不是引用边——新鲜度与资格判卷归 W2 source-snapshot 消费链）",
  "knowledge 库与 exception ledger 的对象引用（ADVISORY 策展面 / 异常登记面——非失效传播边）",
  "production challenge/breach 链（§95.3 State Challenge 质疑边——语义是状态质疑非依赖失效）",
  "外部协议 manifest 的 requires/conflicts（W4 spec-routing 路由核内部闭包——协议选择语义不并入失效闭包）",
  "readiness/handoff/reconciliation 等无落盘输入指纹的 generated 面（消费资格见 invalidation.ts FRESHNESS_UNADAPTED_PRODUCERS 诚实清单）",
];

/** 派生边 id 词形（DXE-<12hex>；与台账 EDGE- 词形刻意区分——见模块头注）。 */
export const DERIVED_EDGE_ID_PATTERN = /^DXE-[0-9a-f]{12}$/;

/** sources entry id 词形（20-sources-authority schema source_entry.id 同法式）。 */
const SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

// ============================================================
// 输入形态（各数据源的最小投影——由调用方从真实平面只读采集）
// ============================================================

/** 闭包节点身份（plane 词表内 + 非空 id；节点不判存在性——存在性归采集面）。 */
export interface ImpactNodeId {
  readonly plane: ImpactPlaneValue;
  readonly id: string;
}

/** truth-index 对象的最小投影（只读采集面；rev/body_sha256 是 upstream revision 锚）。 */
export interface ImpactObjectInput {
  readonly id: string;
  readonly rev: number;
  readonly body_sha256: string | null;
  /** payload.source_refs（来源 id 词形；20 schema source_entry.id 对账）。 */
  readonly payload_source_refs: readonly string[];
  /** denominator_refs[].id（contract/baseline 分母声明）。 */
  readonly denominator_refs: readonly string[];
  /** implements_change（任务 → CHANGE 链）。 */
  readonly implements_change: string | null;
}

/** decision-graph sidecar 的最小投影（scratchpad 维度）。 */
export interface ImpactDecisionGraphInput {
  readonly discovery_id: string;
  readonly decisions: readonly {
    readonly decision_id: string;
    readonly depends_on: readonly string[];
    /** affects 条目（宽松词形——governed id 词形才解析为 truth 节点，其余 unresolved）。 */
    readonly affects: readonly string[];
  }[];
}

/** generated 产物输入声明的最小投影（context manifest 等）。 */
export interface ImpactGeneratedInput {
  readonly generated_id: string;
  readonly input_refs: readonly string[];
}

/** 来源版本锚的最小投影（sources/index.yaml 装载产物投影）。 */
export interface ImpactSourceInput {
  readonly source_id: string;
  /** 版本注记（缺席 = null 显式——不冒充已锚定）。 */
  readonly version: string | null;
}

/** 派生闭包输入（五数据源；全部只读投影，本模块零 IO 不自采）。 */
export interface DeriveImpactInput {
  /** state/relations.jsonl 台账边（EDGE-；truth/catalog 两平面）。 */
  readonly relations: readonly RelationEntry[];
  readonly objects: readonly ImpactObjectInput[];
  readonly decisionGraphs: readonly ImpactDecisionGraphInput[];
  readonly generated: readonly ImpactGeneratedInput[];
  readonly sources: readonly ImpactSourceInput[];
}

// ============================================================
// 输出合同（后果行携带 upstream identity/revision + 命中路径 + truncated）
// ============================================================

/** 单条后果行（「为什么受影响」的结构化承载——why 链素材归 invalidation.ts 消费）。 */
export interface DerivedImpactRow {
  readonly plane: ImpactPlaneValue;
  readonly id: string;
  /** 距根跳数（根的直接依赖者 = 1——impactClosure 同语义）。 */
  readonly depth: number;
  /** 经由哪条边到达（EDGE- 台账边 / DXE- 派生边——影响链证据位）。 */
  readonly via_edge_id: string;
  /** 边类型（EDGE- = relation_type 词形；DXE- = ADAPTED_RELATION_KINDS 词形）。 */
  readonly via_kind: string;
  /** 从根到本节点的边 id 链（命中路径——逐跳可回放）。 */
  readonly path_edge_ids: readonly string[];
  /** 上游（被依赖方）身份 + revision 锚；root 行不出现在 rows（闭包只含受影响方）。 */
  readonly upstream: {
    readonly plane: ImpactPlaneValue;
    readonly id: string;
    /** truth=rev@<n>；source=version（null 显式）；discovery/generated=null（无 revision 输入面——不猜测）。 */
    readonly revision: string | null;
  };
  /** 该行的下游扩展因深度截断未探索（截断图不冒充完整图的行级呈现）。 */
  readonly truncated: boolean;
}

export interface DerivedImpactUnresolvedRef {
  readonly from_plane: ImpactPlaneValue;
  readonly from_id: string;
  /** 声明字段（depends_on/affects/payload_source_refs/denominator_refs/implements_change/input_refs）。 */
  readonly field: string;
  readonly ref: string;
}

export interface DerivedImpactResult {
  readonly root: ImpactNodeId;
  readonly rows: readonly DerivedImpactRow[];
  readonly max_depth_reached: boolean;
  readonly unresolved_refs: readonly DerivedImpactUnresolvedRef[];
  /** 分母注记（固定词形——闭包语义边界随行携带）。 */
  readonly denominator_note: string;
  /** 未接入资产诚实清单（UNADAPTED_ASSET_INVENTORY 原样）。 */
  readonly unadapted_assets: readonly string[];
}

// ============================================================
// 派生边构建（内存态；DXE 内容寻址幂等去重）
// ============================================================

/** 内存派生边（统一依赖方向：source 端依赖 target 端——target 变化则 source 受影响）。 */
interface DerivedEdge {
  readonly edge_id: string;
  /** EDGE-（台账）或 DXE-（派生）。 */
  readonly edge_id_kind: "ledger" | "derived";
  readonly kind: string;
  readonly source: ImpactNodeId;
  readonly target: ImpactNodeId;
}

function derivedEdgeId(source: ImpactNodeId, kind: string, target: ImpactNodeId): string {
  return `DXE-${sha256OfCanonical({ source, kind, target }).slice(
    "sha256:".length,
    "sha256:".length + 12,
  )}`;
}

function endpointToPlane(domain: "truth" | "catalog", id: string): ImpactNodeId {
  return { plane: domain, id };
}

/** governed id 词形判定（A5 closed-world 文法闸——affects/input_refs 的解析器）。 */
function isGovernedIdWordform(ref: string): boolean {
  try {
    parseGovernedId(ref);
    return true;
  } catch (error) {
    if (error instanceof GovernedIdParseError) return false;
    throw error;
  }
}

/**
 * 从五数据源构建统一派生边集（内存态；同三元组 DXE 内容寻址天然去重——Map 键即三元组）。
 * 台账边照常纳入（EDGE- 原词形、truth/catalog 两域归一平面）。
 */
function buildDerivedEdges(input: DeriveImpactInput): Map<string, DerivedEdge> {
  const edges = new Map<string, DerivedEdge>();
  const put = (edge: DerivedEdge): void => {
    const key = `${edge.source.plane}:${edge.source.id}|${edge.kind}|${edge.target.plane}:${edge.target.id}`;
    if (!edges.has(key)) edges.set(key, edge);
  };

  // —— 台账边（EDGE-；依赖方向与 relations.ts 语义一致：source 依赖 target） ——
  for (const entry of input.relations) {
    put({
      edge_id: entry.edge_id,
      edge_id_kind: "ledger",
      kind: entry.type,
      source: endpointToPlane(entry.source.domain, entry.source.id),
      target: endpointToPlane(entry.target.domain, entry.target.id),
    });
  }

  // —— 对象派生边（PAYLOAD_SOURCE_REF / CONTRACT_BASELINE_REF） ——
  for (const object of input.objects) {
    const self: ImpactNodeId = { plane: "truth", id: object.id };
    for (const ref of object.payload_source_refs) {
      put({
        edge_id: derivedEdgeId(self, "PAYLOAD_SOURCE_REF", { plane: "source", id: ref }),
        edge_id_kind: "derived",
        kind: "PAYLOAD_SOURCE_REF",
        source: self,
        target: { plane: "source", id: ref },
      });
    }
    for (const ref of object.denominator_refs) {
      put({
        edge_id: derivedEdgeId(self, "CONTRACT_BASELINE_REF", { plane: "truth", id: ref }),
        edge_id_kind: "derived",
        kind: "CONTRACT_BASELINE_REF",
        source: self,
        target: { plane: "truth", id: ref },
      });
    }
    if (object.implements_change !== null && object.implements_change.length > 0) {
      put({
        edge_id: derivedEdgeId(self, "CONTRACT_BASELINE_REF", {
          plane: "truth",
          id: object.implements_change,
        }),
        edge_id_kind: "derived",
        kind: "CONTRACT_BASELINE_REF",
        source: self,
        target: { plane: "truth", id: object.implements_change },
      });
    }
  }

  // —— Decision 派生边（DECISION_DEPENDS_ON；affects 反向 = affects 条目依赖 decision） ——
  for (const graph of input.decisionGraphs) {
    for (const decision of graph.decisions) {
      const self: ImpactNodeId = { plane: "discovery", id: decision.decision_id };
      for (const dep of decision.depends_on) {
        put({
          edge_id: derivedEdgeId(self, "DECISION_DEPENDS_ON", { plane: "discovery", id: dep }),
          edge_id_kind: "derived",
          kind: "DECISION_DEPENDS_ON",
          source: self,
          target: { plane: "discovery", id: dep },
        });
      }
      for (const affect of decision.affects) {
        // affects 宽松词形只有 governed id 才解析为 truth 节点（其余 unresolved——不猜测）。
        // 边方向：decision 依赖其 affects 对象的现势性——对象受上游变化波及时 decision
        // 需要重审（review 面经本边进入反向闭包）。
        if (!isGovernedIdWordform(affect)) continue;
        put({
          edge_id: derivedEdgeId(self, "DECISION_DEPENDS_ON", { plane: "truth", id: affect }),
          edge_id_kind: "derived",
          kind: "DECISION_DEPENDS_ON",
          source: self,
          target: { plane: "truth", id: affect },
        });
      }
    }
  }

  // —— generated 派生边（GENERATED_INPUT_REF；input_refs 双词形解析） ——
  for (const generated of input.generated) {
    const self: ImpactNodeId = { plane: "generated", id: generated.generated_id };
    for (const ref of generated.input_refs) {
      if (isGovernedIdWordform(ref)) {
        put({
          edge_id: derivedEdgeId(self, "GENERATED_INPUT_REF", { plane: "truth", id: ref }),
          edge_id_kind: "derived",
          kind: "GENERATED_INPUT_REF",
          source: self,
          target: { plane: "truth", id: ref },
        });
      } else if (SOURCE_ID_PATTERN.test(ref)) {
        put({
          edge_id: derivedEdgeId(self, "GENERATED_INPUT_REF", { plane: "source", id: ref }),
          edge_id_kind: "derived",
          kind: "GENERATED_INPUT_REF",
          source: self,
          target: { plane: "source", id: ref },
        });
      }
      // 两词形皆不中 → unresolved（在闭包主函数登记——此处只建可解析边）。
    }
  }

  return edges;
}

// ============================================================
// 派生闭包（impactClosure 同构反向 BFS；确定性输出）
// ============================================================

/**
 * deriveImpactClosure（纯函数）：从根出发沿「谁依赖我」反向 BFS（四类 adapted 边 +
 * 台账边统一闭包）。语义镜像 relations.ts impactClosure：maxDepth 缺省 4、域 1..16
 * （SCHEMA_INVALID 越界拒绝）、visited 首次到达即定（菱形去重 + 环防死循环）、
 * (depth, plane, id) 确定性排序、max_depth_reached 显式 + 行级 truncated 标记。
 * 悬空引用不猜测：unresolved_refs 显式登记（闭包分母外诚实呈现）。
 */
export function deriveImpactClosure(
  input: DeriveImpactInput,
  root: ImpactNodeId,
  options?: { readonly maxDepth?: number },
): DerivedImpactResult {
  const maxDepth = options?.maxDepth ?? 4;
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 16) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `maxDepth 非法：${String(maxDepth)}（须 1..16——impactClosure 同闸镜像，防御失控 BFS）`,
      "给出有界深度；超深影响面应显式声明全量审阅而不是放宽截断闸",
      { maxDepth },
    );
  }
  if (!(IMPACT_PLANE_VALUES as readonly string[]).includes(root.plane)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `root.plane 词表外：${String(root.plane)}（${IMPACT_PLANE_VALUES.join("/")}）`,
      "影响平面五值闭包见 IMPACT_PLANE_VALUES；扩值走本闭包定稿",
      { plane: root.plane },
    );
  }
  if (root.id.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "root.id 为空（空端点无从建闭包）",
      "给出非空节点 id（truth=governed id / source=来源 id / discovery=DECISION.* / generated=产物 id）",
      {},
    );
  }

  const edges = buildDerivedEdges(input);

  // —— revision 锚查找表（upstream 行级呈现；查无 = null 显式不猜测） ——
  const objectById = new Map(input.objects.map((object) => [object.id, object]));
  const sourceById = new Map(input.sources.map((source) => [source.source_id, source]));
  const revisionOf = (node: ImpactNodeId): string | null => {
    if (node.plane === "truth") {
      const object = objectById.get(node.id);
      return object === undefined ? null : `rev@${String(object.rev)}`;
    }
    if (node.plane === "source") {
      return sourceById.get(node.id)?.version ?? null;
    }
    return null; // discovery/generated 无 revision 输入面——显式 null。
  };

  // —— 悬空引用登记（输入完整性缺陷不因根选择而静默；声明即可见） ——
  const unresolved: DerivedImpactUnresolvedRef[] = [];
  const registerUnresolved = (
    fromPlane: ImpactPlaneValue,
    fromId: string,
    field: string,
    ref: string,
  ): void => {
    unresolved.push({ from_plane: fromPlane, from_id: fromId, field, ref });
  };
  const knownSource = (id: string): boolean => sourceById.has(id);
  const knownNodeId = (plane: ImpactPlaneValue, id: string): boolean => {
    switch (plane) {
      case "truth":
        return objectById.has(id);
      case "source":
        return knownSource(id);
      case "discovery":
        return input.decisionGraphs.some((graph) =>
          graph.decisions.some((decision) => decision.decision_id === id),
        );
      case "generated":
        return input.generated.some((generated) => generated.generated_id === id);
      case "catalog":
        // catalog 条目存在性归 catalog-lock 消费面——本面无分母可查，不判存亡。
        return true;
    }
  };
  for (const object of input.objects) {
    for (const ref of object.payload_source_refs) {
      if (!knownSource(ref)) registerUnresolved("truth", object.id, "payload_source_refs", ref);
    }
    for (const ref of object.denominator_refs) {
      if (!knownNodeId("truth", ref)) registerUnresolved("truth", object.id, "denominator_refs", ref);
    }
    if (object.implements_change !== null && object.implements_change.length > 0) {
      if (!knownNodeId("truth", object.implements_change)) {
        registerUnresolved("truth", object.id, "implements_change", object.implements_change);
      }
    }
  }
  for (const graph of input.decisionGraphs) {
    for (const decision of graph.decisions) {
      for (const dep of decision.depends_on) {
        if (!knownNodeId("discovery", dep)) {
          registerUnresolved("discovery", decision.decision_id, "depends_on", dep);
        }
      }
      for (const affect of decision.affects) {
        if (!isGovernedIdWordform(affect)) {
          registerUnresolved("discovery", decision.decision_id, "affects", affect);
        }
      }
    }
  }
  for (const generated of input.generated) {
    for (const ref of generated.input_refs) {
      if (
        !isGovernedIdWordform(ref) &&
        !SOURCE_ID_PATTERN.test(ref)
      ) {
        registerUnresolved("generated", generated.generated_id, "input_refs", ref);
      } else if (
        isGovernedIdWordform(ref)
          ? !knownNodeId("truth", ref)
          : !knownNodeId("source", ref)
      ) {
        registerUnresolved("generated", generated.generated_id, "input_refs", ref);
      }
    }
  }

  // —— incoming 邻接表（target → edges；反向 BFS 的遍历基础） ——
  const incoming = new Map<string, DerivedEdge[]>();
  for (const edge of edges.values()) {
    const key = `${edge.target.plane}:${edge.target.id}`;
    const list = incoming.get(key) ?? [];
    list.push(edge);
    incoming.set(key, list);
  }

  // —— 反向 BFS（visited 首次到达即定；root 自身不入行） ——
  const rows: DerivedImpactRow[] = [];
  const visited = new Set<string>([`${root.plane}:${root.id}`]);
  const frontier: { node: ImpactNodeId; depth: number; path: readonly string[] }[] = [
    { node: { plane: root.plane, id: root.id }, depth: 0, path: [] },
  ];
  let maxDepthReached = false;
  while (frontier.length > 0) {
    const current = frontier.shift();
    if (current === undefined) break;
    if (current.depth >= maxDepth) {
      maxDepthReached = true;
      continue;
    }
    const currentEdges = incoming.get(`${current.node.plane}:${current.node.id}`) ?? [];
    for (const edge of currentEdges) {
      const sourceKey = `${edge.source.plane}:${edge.source.id}`;
      if (visited.has(sourceKey)) continue;
      visited.add(sourceKey);
      const depth = current.depth + 1;
      rows.push({
        plane: edge.source.plane,
        id: edge.source.id,
        depth,
        via_edge_id: edge.edge_id,
        via_kind: edge.kind,
        path_edge_ids: [...current.path, edge.edge_id],
        upstream: {
          plane: current.node.plane,
          id: current.node.id,
          revision: revisionOf(current.node),
        },
        // 本行深度已达截断闸 → 其依赖者不再探索（行级截断呈现）。
        truncated: depth >= maxDepth,
      });
      frontier.push({ node: edge.source, depth, path: [...current.path, edge.edge_id] });
    }
  }

  rows.sort(
    (a, b) =>
      a.depth - b.depth ||
      (a.plane < b.plane ? -1 : a.plane > b.plane ? 1 : 0) ||
      (a.id < b.id ? -1 : 1),
  );
  unresolved.sort(
    (a, b) =>
      (a.from_plane < b.from_plane ? -1 : a.from_plane > b.from_plane ? 1 : 0) ||
      (a.from_id < b.from_id ? -1 : a.from_id > b.from_id ? 1 : 0) ||
      (a.field < b.field ? -1 : a.field > b.field ? 1 : 0) ||
      (a.ref < b.ref ? -1 : 1),
  );

  return {
    root: { plane: root.plane, id: root.id },
    rows,
    max_depth_reached: maxDepthReached,
    unresolved_refs: unresolved,
    denominator_note:
      "闭包只证明已适配边的可达性（适配分母 = 四类 ADAPTED_RELATION_KINDS + relations 台账边）；未接入资产见 unadapted_assets；截断图不冒充完整图（max_depth_reached/truncated 显式）",
    unadapted_assets: [...UNADAPTED_ASSET_INVENTORY],
  };
}
