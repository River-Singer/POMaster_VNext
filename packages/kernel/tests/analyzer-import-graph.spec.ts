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
    expect(result.unmapped).toEqual([]);
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
