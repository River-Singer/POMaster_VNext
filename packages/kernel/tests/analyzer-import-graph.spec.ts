/**
 * analyzer-import-graph.spec.ts —— import 静态扫描 Analyzer（P-v06 批次 2 Frontend
 * 模型 kernel 逻辑半场）。
 *
 * 判据锚：
 * - analyze-only 封条：输入是文件内容集（零 fs 零 store 依赖）；产出 CALLS 边提案
 *   不落盘——登记由消费方经 registerRelation 显式执行，EDGE-<12hex> 内容寻址幂等使
 *   重复扫描重放 noop 安全（PRD v0.6 §103/§6-8）；
 * - §148 八字段报告经 normalizeAnalyzerReport 单一实现判卷；置信级规则=unmapped
 *   空 → deterministic / 非空 → probable（确定性宣称杀手同源）；
 * - 相对引用以源文件目录折叠为仓库相对路径后按候选后缀序归一（原样/.ts/.tsx/.vue/
 *   .js//index.ts，首个命中 mapping 者胜）；裸引用只计数（externalImports）；
 *   mapping 值非法 → SCHEMA_INVALID 整体拒绝（A5 closed-world，禁静默跳过坏条目）；
 * - 同输入重放字节稳定（A4 零墙钟）。
 */
import { describe, expect, it } from "vitest";
import {
  ANALYZER_IMPORT_GRAPH_ID,
  analyzeImportGraph,
  createStore,
  deriveImportGraphScopeReview,
  pathsOf,
  readRelations,
  registerRelation,
  type ImportGraphInput,
} from "@pomaster/kernel";
import { makeStore } from "./helpers.js";

const SOURCE_SHA = `sha256:${"ab".repeat(32)}`;

/** Supplier 词形三文件 fixture（page.vue→api.ts→extra.ts；两条 import 正则各产一边）。 */
function supplierInput(): ImportGraphInput {
  return {
    files: [
      {
        path: "src/api/supplier/api.ts",
        content: [
          'const lazy = () => import("./extra");',
          'export const list = () => fetch("/suppliers");',
        ].join("\n"),
      },
      { path: "src/api/supplier/extra.ts", content: "export const extra = 1;\n" },
      {
        path: "src/pages/supplier/index.vue",
        content: [
          '<script setup lang="ts">',
          'import { list } from "../../api/supplier/api";',
          'import { Button } from "ant-design-vue";',
          "</script>",
        ].join("\n"),
      },
    ],
    mapping: {
      "src/api/supplier/api.ts": "API_REQ.SUPPLIER.LIST.1",
      "src/api/supplier/extra.ts": "API_REQ.SUPPLIER.EXPORT.1",
      "src/pages/supplier/index.vue": "PAGE.SUPPLIER_MANAGEMENT",
    },
    sourceSha: SOURCE_SHA,
  };
}

describe("analyzeImportGraph（边提案 + §148 报告）", () => {
  it("三文件两 CALLS 边（静态 + 动态 import 各一）+ 裸引用只计数 + deterministic", () => {
    const result = analyzeImportGraph(supplierInput());
    expect(result.edges).toEqual([
      {
        source: "API_REQ.SUPPLIER.LIST.1",
        target: "API_REQ.SUPPLIER.EXPORT.1",
        type: "CALLS",
        locator: "src/api/supplier/api.ts",
      },
      {
        source: "PAGE.SUPPLIER_MANAGEMENT",
        target: "API_REQ.SUPPLIER.LIST.1",
        type: "CALLS",
        locator: "src/pages/supplier/index.vue",
      },
    ]);
    expect(result.externalImports).toBe(1);
    expect(result.aliasImports).toBe(0);
    expect(result.aliasResolvedImports).toBe(0);
    expect(result.aliasUnresolvedImports).toBe(0);
    expect(result.unmapped).toEqual([]);
    expect(result.pathCandidates).toEqual([
      {
        source: "src/api/supplier/api.ts",
        target: "src/api/supplier/extra.ts",
        specifier: "./extra",
      },
      {
        source: "src/pages/supplier/index.vue",
        target: "src/api/supplier/api.ts",
        specifier: "../../api/supplier/api",
      },
    ]);
    expect(result.pathUnresolved).toEqual([]);
    expect(result.report.analyzer).toBe(ANALYZER_IMPORT_GRAPH_ID);
    expect(result.report.objects_resolved).toBe(3);
    expect(result.report.relations_resolved).toBe(2);
    expect(result.report.unresolved_constructs).toEqual([]);
    expect(result.report.parse_failures).toEqual([]);
    expect(result.report.confidence).toBe("deterministic");
    expect(result.report.source_sha).toBe(SOURCE_SHA);
    expect(result.report.scanned_scope).toBe("import-scan:3-files");
  });

  it("未映射引用 → unmapped 清单（fail-closed 披露）+ 置信降级 probable", () => {
    const input = supplierInput();
    const result = analyzeImportGraph({
      ...input,
      files: [
        ...input.files,
        {
          path: "src/pages/supplier/panel.vue",
          content: 'import { helper } from "../shared/helper";\n',
        },
      ],
      mapping: { ...input.mapping, "src/pages/supplier/panel.vue": "PAGE.SUPPLIER_PANEL" },
    });
    expect(result.edges).toHaveLength(2);
    expect(result.unmapped).toEqual([
      {
        source: "src/pages/supplier/panel.vue",
        specifier: "../shared/helper",
        reason: "target_unresolved",
      },
    ]);
    expect(result.report.confidence).toBe("probable");
    expect(result.report.unresolved_constructs).toEqual([
      "src/pages/supplier/panel.vue -> ../shared/helper (target_unresolved)",
    ]);
    expect(result.report.objects_resolved).toBe(4);
  });

  it("Brownfield 路径候选独立于 governed mapping：可审查真实源码连接，缺物理目标显式披露", () => {
    const result = analyzeImportGraph({
      files: [
        { path: "src/app.ts", content: 'import { helper } from "./helper";\nimport "./missing";\n' },
        { path: "src/helper.ts", content: "export const helper = 1;\n" },
      ],
      mapping: {},
      sourceSha: SOURCE_SHA,
    });
    expect(result.edges).toEqual([]);
    expect(result.unmapped).toEqual([
      { source: "src/app.ts", specifier: "./helper", reason: "target_unresolved" },
      { source: "src/app.ts", specifier: "./missing", reason: "target_unresolved" },
    ]);
    expect(result.pathCandidates).toEqual([
      { source: "src/app.ts", target: "src/helper.ts", specifier: "./helper" },
    ]);
    expect(result.pathUnresolved).toEqual([
      {
        source: "src/app.ts",
        specifier: "./missing",
        reason: "target_not_found_in_scanned_files",
      },
    ]);
  });

  it("tsconfig path alias 与 re-export 共用路径候选解析；外部包单独计数", () => {
    const result = analyzeImportGraph({
      files: [
        {
          path: "src/app.ts",
          content: 'import { calc } from "@/shared/calc";\nimport { ref } from "vue";\n',
        },
        {
          path: "src/shared/index.ts",
          content: 'export { calc } from "./calc";\n',
        },
        { path: "src/shared/calc.ts", content: "export const calc = 1;\n" },
      ],
      mapping: {},
      pathAliases: [{ pattern: "@/*", targets: ["src/*"] }],
      sourceSha: SOURCE_SHA,
    });
    expect(result.externalImports).toBe(1);
    expect(result.aliasImports).toBe(1);
    expect(result.aliasResolvedImports).toBe(1);
    expect(result.aliasUnresolvedImports).toBe(0);
    expect(result.pathCandidates).toEqual([
      { source: "src/app.ts", target: "src/shared/calc.ts", specifier: "@/shared/calc" },
      { source: "src/shared/index.ts", target: "src/shared/calc.ts", specifier: "./calc" },
    ]);
    expect(result.pathUnresolved).toEqual([]);
  });

  it("命中 alias 但物理目标缺席时不冒充外部包，并显式进入 pathUnresolved", () => {
    const result = analyzeImportGraph({
      files: [{ path: "src/app.ts", content: 'import { missing } from "@/missing";\n' }],
      mapping: {},
      pathAliases: [{ pattern: "@/*", targets: ["src/*"] }],
      sourceSha: SOURCE_SHA,
    });
    expect(result.externalImports).toBe(0);
    expect(result.aliasImports).toBe(1);
    expect(result.aliasResolvedImports).toBe(0);
    expect(result.aliasUnresolvedImports).toBe(1);
    expect(result.pathUnresolved).toEqual([
      {
        source: "src/app.ts",
        specifier: "@/missing",
        reason: "alias_target_not_found_in_scanned_files",
      },
    ]);
  });

  it("源文件未登记 mapping → 不产边不静默丢（reason=source_not_mapped）+ objects_resolved 差额披露", () => {
    const result = analyzeImportGraph({
      files: [
        { path: "src/other/panel.ts", content: 'import { list } from "../api/supplier/api";\n' },
      ],
      mapping: { "src/api/supplier/api.ts": "API_REQ.SUPPLIER.LIST.1" },
      sourceSha: SOURCE_SHA,
    });
    expect(result.edges).toEqual([]);
    expect(result.unmapped).toEqual([
      {
        source: "src/other/panel.ts",
        specifier: "../api/supplier/api",
        reason: "source_not_mapped",
      },
    ]);
    expect(result.report.objects_resolved).toBe(0);
    expect(result.report.confidence).toBe("probable");
  });

  it("候选后缀序：原样命中优先于 +'.ts'（首个命中 mapping 者胜）", () => {
    const result = analyzeImportGraph({
      files: [{ path: "src/app.ts", content: 'import { side } from "./side";\n' }],
      mapping: {
        "src/app.ts": "PAGE.MAIN",
        // 两键同时在场：原样候选 "src/side" 先命中——裸键胜出（批次 2 规格序）。
        "src/side": "PAGE.SIDE_BARE",
        "src/side.ts": "PAGE.SIDE_TS",
      },
      sourceSha: SOURCE_SHA,
    });
    expect(result.edges).toEqual([
      { source: "PAGE.MAIN", target: "PAGE.SIDE_BARE", type: "CALLS", locator: "src/app.ts" },
    ]);
  });

  it("mapping 值非 governed id → SCHEMA_INVALID 整体拒绝（A5；禁静默跳过坏条目）", () => {
    expect(() =>
      analyzeImportGraph({
        files: [{ path: "src/a.ts", content: 'import "./b";\n' }],
        mapping: { "src/a.ts": "not-a-governed-id" },
        sourceSha: SOURCE_SHA,
      }),
    ).toThrow("governed id 文法");
  });

  it("sourceSha 词形非法 → SCHEMA_INVALID（SOURCE_SHA_PATTERN 锚位；normalizeAnalyzerReport 单一实现）", () => {
    const input = supplierInput();
    expect(() =>
      analyzeImportGraph({ ...input, sourceSha: "sha256:nothex" }),
    ).toThrow("source_sha");
  });

  it("同输入重放字节稳定（A4 零墙钟；乱序 files 输入收敛同一报告）", () => {
    const input = supplierInput();
    const shuffled: ImportGraphInput = {
      ...input,
      files: [...input.files].reverse(),
    };
    const first = JSON.stringify(analyzeImportGraph(input));
    const second = JSON.stringify(analyzeImportGraph(shuffled));
    expect(second).toBe(first);
  });
});

describe("deriveImportGraphScopeReview 任务范围审查投影", () => {
  const edges = [
    { source: "src/root.ts", target: "src/a.ts", specifier: "./a" },
    { source: "src/root.ts", target: "src/b.ts", specifier: "./b" },
    { source: "src/a.ts", target: "src/shared.ts", specifier: "./shared" },
    { source: "src/b.ts", target: "src/shared.ts", specifier: "./shared" },
    { source: "src/shared.ts", target: "src/root.ts", specifier: "./root" },
    { source: "src/consumer.ts", target: "src/root.ts", specifier: "./root" },
    { source: "src/top.ts", target: "src/consumer.ts", specifier: "./consumer" },
  ] as const;

  it("环与菱形按最短路径收敛，双方向保留 root/depth/via", () => {
    const result = deriveImportGraphScopeReview({ roots: ["src/root.ts"], pathCandidates: edges, maxDepth: 4 });
    expect(result.truncated).toBe(false);
    expect(result.candidates).toEqual([
      { root: "src/root.ts", direction: "root", path: "src/root.ts", depth: 0, via: null },
      {
        root: "src/root.ts",
        direction: "dependency",
        path: "src/a.ts",
        depth: 1,
        via: edges[0],
      },
      {
        root: "src/root.ts",
        direction: "dependency",
        path: "src/b.ts",
        depth: 1,
        via: edges[1],
      },
      {
        root: "src/root.ts",
        direction: "dependency",
        path: "src/shared.ts",
        depth: 2,
        via: edges[2],
      },
      {
        root: "src/root.ts",
        direction: "consumer",
        path: "src/consumer.ts",
        depth: 1,
        via: edges[5],
      },
      {
        root: "src/root.ts",
        direction: "consumer",
        path: "src/shared.ts",
        depth: 1,
        via: edges[4],
      },
      {
        root: "src/root.ts",
        direction: "consumer",
        path: "src/a.ts",
        depth: 2,
        via: edges[2],
      },
      {
        root: "src/root.ts",
        direction: "consumer",
        path: "src/b.ts",
        depth: 2,
        via: edges[3],
      },
      {
        root: "src/root.ts",
        direction: "consumer",
        path: "src/top.ts",
        depth: 2,
        via: edges[6],
      },
    ]);
  });

  it("重复多根与重复边去重；输入乱序重放确定", () => {
    const first = deriveImportGraphScopeReview({
      roots: ["src/root.ts", "src/a.ts", "src/root.ts"],
      pathCandidates: [...edges, edges[0]],
      maxDepth: 3,
    });
    const second = deriveImportGraphScopeReview({
      roots: ["src/a.ts", "src/root.ts"],
      pathCandidates: [...edges].reverse(),
      maxDepth: 3,
    });
    expect(first.roots).toEqual(["src/a.ts", "src/root.ts"]);
    expect(second).toEqual(first);
  });

  it("maxDepth 只在确有下一层未展开时标记 truncated", () => {
    const truncated = deriveImportGraphScopeReview({ roots: ["src/root.ts"], pathCandidates: edges, maxDepth: 1 });
    expect(truncated.truncated).toBe(true);
    expect(truncated.candidates.some((row) => row.depth > 1)).toBe(false);

    const complete = deriveImportGraphScopeReview({
      roots: ["src/leaf.ts"],
      pathCandidates: [{ source: "src/leaf.ts", target: "src/end.ts", specifier: "./end" }],
      maxDepth: 1,
    });
    expect(complete.truncated).toBe(false);
  });

  it("maxDepth 非 1..16 整数时 fail-closed", () => {
    expect(() => deriveImportGraphScopeReview({ roots: [], pathCandidates: [], maxDepth: 0 })).toThrow("1..16");
    expect(() => deriveImportGraphScopeReview({ roots: [], pathCandidates: [], maxDepth: 1.5 })).toThrow("1..16");
  });
});

describe("analyze-only 封条 + 登记通路（提案→registerRelation 显式落盘）", () => {
  it("边提案经 registerRelation 入账；重复注册 noop 幂等（EDGE 内容寻址）", async () => {
    const made = await makeStore();
    const result = analyzeImportGraph(supplierInput());
    const proposal = result.edges.find((edge) => edge.source === "PAGE.SUPPLIER_MANAGEMENT");
    expect(proposal).toBeDefined();
    const input = {
      type: proposal?.type ?? "",
      source: { domain: "truth", id: proposal?.source ?? "" },
      target: { domain: "truth", id: proposal?.target ?? "" },
      origin: "static_analysis",
      confidence: "deterministic",
      producer: ANALYZER_IMPORT_GRAPH_ID,
      sourceRef: proposal?.locator ?? "",
      locator: proposal?.locator ?? "",
    };
    const first = await registerRelation(made.store, input);
    expect(first.registered).toBe(true);
    expect(first.entry.producer).toBe("ANALYZER.TS.IMPORT_GRAPH");
    // 同三元组重复扫描重放 → noop（registered=false 返回既有边；台账零增长）。
    const second = await registerRelation(made.store, input);
    expect(second.registered).toBe(false);
    expect(second.entry.edge_id).toBe(first.entry.edge_id);
    expect(readRelations(pathsOf(made.store))).toHaveLength(1);
  });

  it("空 files 是合法输入（零分母显式呈现于 report；deterministic 零边）", () => {
    const result = analyzeImportGraph({
      files: [],
      mapping: { "src/a.ts": "PAGE.MAIN" },
      sourceSha: SOURCE_SHA,
    });
    expect(result.edges).toEqual([]);
    expect(result.report.objects_resolved).toBe(0);
    expect(result.report.relations_resolved).toBe(0);
    expect(result.report.confidence).toBe("deterministic");
    expect(result.report.scanned_scope).toBe("import-scan:0-files");
  });

  it("createStore 直连可用（导出面经 @pomaster/kernel barrel——嵌入方形态冒烟）", async () => {
    const made = await makeStore();
    const store = await createStore(made.root);
    expect(store.currentSeq).not.toBeNull();
  });
});
