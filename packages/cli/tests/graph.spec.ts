/**
 * graph.spec.ts —— `pomaster graph <governed-id>`：对象图视图（P-v06 批次 4；
 * PRD §104-113 Studio 最小 CLI 投影 + §111 Trace Everything 读侧）。
 *
 * 判据锚：
 * - 判卷权威在 kernel（CLI 分层纪律）：familyOfId/forwardDependencies/
 *   reverseDependents/impactClosure 纯函数复用，CLI 只编排呈现，零 kernel 源码改动；
 * - fail-closed 错误路径：未 init → NOT_CONFIGURED（带 init 路标，且零建账——graph
 *   不调 createStore）/ 小写 id → FATAL_ID_GRAMMAR / 未知前缀 → FATAL_UNKNOWN_PREFIX
 *   （A5 closed-world，kernel 权威）/ 对象缺席 → OBJECT_NOT_FOUND（闭包根不存在不得
 *   冒充空影响面）/ --view 词表外与 --max-depth 词形非法 → SCHEMA_INVALID；
 * - all 视图（Supplier 三对象三边 seed）：family=UI、INSTANCE_OF 采纳边单列（catalog
 *   端点）、正向依赖按 type 分组（INSTANCE_OF 不混入 forward 分组——同边不双呈现）、
 *   反向 dependents 分组、机读与人读双形态、重跑字节一致（确定性）；
 * - --view impact 只出闭包段：FIELD 根闭包 = API_REQ(depth1)→PAGE(depth2)（via_edge_type
 *   断言）；max-depth=1 截断 → max_depth_reached=true 显式呈现（禁静默）；max-depth=0
 *   → kernel 域闸 SCHEMA_INVALID fail-closed；
 * - 空态显式（NO_MATCH 纪律）：零边 = 「无边登记」不冒充无依赖（relations.jsonl 缺席
 *   容忍——空图是合法状态）；
 * - 纯读零写入（A1 出口判据）：执行前后 .pomaster 全树字节不变（inspect.spec 先例）；
 *   侧车缺失的存量 store 上照常可读且零重建（loadStoreReadOnly 纪律锚——createStore
 *   的 ensureSidecars 会补写骨架，复发即 fail）。
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore, loadStoreReadOnly, registerRelation } from "@pomaster/kernel";
import { createProgram, runCli, runGraph, type CliEnvelope, type GraphResult } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-graph-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 本地 fixture（Supplier Tracer 词形锚；v06-tracer-supplier.spec 同源三边）
// ============================================================

const PAGE_ID = "PAGE.SUPPLIER_MANAGEMENT";
const API_ID = "API_REQ.SUPPLIER.LIST.1";
const FIELD_ID = "FIELD.SUPPLIER.NAME";

const CALLS_EDGE = {
  type: "CALLS",
  source: { domain: "truth", id: PAGE_ID },
  target: { domain: "truth", id: API_ID },
  origin: "static_analysis",
  confidence: "deterministic",
  producer: "ANALYZER.TS.IMPORT_GRAPH",
  sourceRef: "src/pages/supplier/index.vue:42（graph.spec 词面锚）",
  locator: "src/pages/supplier/index.vue:42",
} as const;

const READS_EDGE = {
  type: "READS",
  source: { domain: "truth", id: API_ID },
  target: { domain: "truth", id: FIELD_ID },
  origin: "static_analysis",
  confidence: "deterministic",
  producer: "ANALYZER.SQL.REPOSITORY",
  sourceRef: "repository 扫描锚（graph.spec）",
} as const;

const INSTANCE_OF_EDGE = {
  type: "INSTANCE_OF",
  source: { domain: "truth", id: PAGE_ID },
  target: { domain: "catalog", id: "PAGE_ARCHETYPE.MASTER_DATA" },
  origin: "human_declared",
  confidence: "declared",
  producer: "human:owner",
  sourceRef: "graph.spec 采纳边锚（Supplier 页采用 MASTER_DATA 原型）",
  declaredBy: "owner",
} as const;

function registerOwner(owner: string): void {
  const path = join(root, ".pomaster", "state", "authority.json");
  const current = JSON.parse(readFileSync(path, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  current.authorities[owner] = {};
  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`, "utf8");
}

async function seedObject(
  store: ReturnType<typeof loadStoreReadOnly>,
  id: string,
  kind: string,
  axisProfile: string,
  titleZh: string,
): Promise<void> {
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id,
          kind,
          axisProfile,
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh,
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: { surface: "V1" },
        } as never,
      },
    ],
  } as never);
}

/** 三对象（PAGE/API_REQ/FIELD）+ 三边（CALLS/READS/INSTANCE_OF→catalog 目标）。 */
async function seedSupplierGraph(): Promise<void> {
  await createStore(root);
  registerOwner("BUSINESS_OWNER");
  const store = loadStoreReadOnly(root);
  await seedObject(store, PAGE_ID, "page_surface", "page_default", "供应商管理");
  await seedObject(store, API_ID, "contract_operation", "contract_default", "供应商列表查询");
  await seedObject(store, FIELD_ID, "field_definition", "field_default", "供应商名称");
  await registerRelation(store, CALLS_EDGE);
  await registerRelation(store, READS_EDGE);
  await registerRelation(store, INSTANCE_OF_EDGE);
}

/** 孤立对象（零边；relations.jsonl 缺席形态）。 */
async function seedLonelyObject(): Promise<void> {
  await createStore(root);
  registerOwner("BUSINESS_OWNER");
  const store = loadStoreReadOnly(root);
  await seedObject(store, "PAGE.LONELY_PAGE", "page_surface", "page_default", "无邻接页");
}

/**
 * .pomaster 全树字节级快照：文件（内容逐字节）+ 目录集合。目录集在案是因为
 * createStore 的 ensureSidecars 除补写四侧车文件外还会重建 runtime/ 平面目录——
 * 纯读零写锚必须对两者同时敏感（pure-read-zero-write.spec 同款判据）。
 */
function snapshot(): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = full.slice(root.length + 1).split("\\").join("/");
      if (statSync(full).isDirectory()) {
        files.set(`${rel}/`, "");
        walk(full);
      } else {
        files.set(rel, readFileSync(full, "utf8"));
      }
    }
  };
  walk(join(root, ".pomaster"));
  return files;
}

/** 存量 store + 侧车缺失形态（pure-read-zero-write.spec 同款剥离面）。 */
function stripSidecars(): void {
  const pomaster = join(root, ".pomaster");
  for (const rel of [
    join("state", "authority.json"),
    join("state", "permits.json"),
    join("state", "journal.jsonl"),
    join("runtime", "producers", "heartbeat.jsonl"),
  ]) {
    rmSync(join(pomaster, ...rel.split("\\")));
  }
  rmSync(join(pomaster, "runtime", "sessions"), { recursive: true, force: true });
  rmSync(join(pomaster, "runtime", "locks"), { recursive: true, force: true });
}

// ============================================================
// fail-closed 错误路径
// ============================================================

describe("runGraph fail-closed 错误路径", () => {
  it("store 未 init → NOT_CONFIGURED fail-closed 带 init 路标，且零建账（graph 不调 createStore）", async () => {
    const outcome = await runGraph({ id: PAGE_ID, rootDir: root });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_CONFIGURED");
    expect(outcome.errors[0]?.hint).toContain("pomaster init");
    expect(existsSync(join(root, ".pomaster"))).toBe(false);
  });

  it("小写 id → FATAL_ID_GRAMMAR（A5 closed-world；SCREAMING_SNAKE 大写纪律）", async () => {
    await seedSupplierGraph();
    const outcome = await runGraph({ id: "page.supplier", rootDir: root });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("FATAL_ID_GRAMMAR");
  });

  it("未知前缀 → FATAL_UNKNOWN_PREFIX（词表外前缀显式拒绝）", async () => {
    await seedSupplierGraph();
    const outcome = await runGraph({ id: "BOGUS.X", rootDir: root });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("FATAL_UNKNOWN_PREFIX");
  });

  it("对象不在 truth-index → OBJECT_NOT_FOUND（闭包根不存在不得冒充空影响面）", async () => {
    await seedSupplierGraph();
    const outcome = await runGraph({ id: "PAGE.ABSENT_ONE", rootDir: root });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("OBJECT_NOT_FOUND");
    expect(outcome.errors[0]?.hint).toContain("status");
  });

  it("--view 词表外 / --max-depth 词形非法 → SCHEMA_INVALID（argv 词形先于 store 装载收敛）", async () => {
    const badView = await runGraph({ id: PAGE_ID, view: "tree", rootDir: root });
    expect(badView.ok).toBe(false);
    expect(badView.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(badView.errors[0]?.message).toContain("--view");

    const badDepth = await runGraph({ id: PAGE_ID, maxDepth: "deep", rootDir: root });
    expect(badDepth.ok).toBe(false);
    expect(badDepth.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(badDepth.errors[0]?.message).toContain("--max-depth");
  });
});

// ============================================================
// all 视图（family / 采纳边 / 正反向分组 / 双形态 / 确定性）
// ============================================================

describe("runGraph all 视图（Supplier 三对象三边）", () => {
  it("PAGE 根：family=UI + INSTANCE_OF 采纳边单列（catalog 端点）+ forward 仅 CALLS 组 + reverse 空态", async () => {
    await seedSupplierGraph();
    const outcome = await runGraph({ id: PAGE_ID, rootDir: root });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    const result = outcome.result as GraphResult;
    expect(result.view).toBe("all");
    expect(result.max_depth).toBe(4);
    expect(result.object?.id).toBe(PAGE_ID);
    expect(result.object?.family).toBe("UI");
    expect(result.object?.kind).toBe("page_surface");
    expect(result.object?.title_zh).toBe("供应商管理");
    expect(result.object?.axes).toMatchObject({ lifecycle: "CURRENT" });
    expect(result.relations_touching).toBe(2);

    // INSTANCE_OF 采纳边（truth→catalog；整边字段齐备）。
    expect(result.instance_of).toHaveLength(1);
    expect(result.instance_of?.[0]?.endpoint).toEqual({
      domain: "catalog",
      id: "PAGE_ARCHETYPE.MASTER_DATA",
    });
    expect(result.instance_of?.[0]?.origin).toBe("human_declared");
    expect(result.instance_of?.[0]?.producer).toBe("human:owner");
    expect(result.instance_of?.[0]?.edge_id).toMatch(/^EDGE-[0-9a-f]{12}$/);

    // 正向依赖分组：只有 CALLS（INSTANCE_OF 已单列——同边不双呈现）。
    expect(result.forward_dependencies).toHaveLength(1);
    expect(result.forward_dependencies?.[0]?.type).toBe("CALLS");
    expect(result.forward_dependencies?.[0]?.edges).toHaveLength(1);
    expect(result.forward_dependencies?.[0]?.edges[0]?.endpoint).toEqual({
      domain: "truth",
      id: API_ID,
    });

    // 反向 dependents：零入边 → 空组（机读显式空，不冒充无依赖）。
    expect(result.reverse_dependents).toEqual([]);

    // impact 邻域：PAGE 无入边 → 空闭包 + max_depth_reached=false 显式。
    expect(result.impact?.affected).toEqual([]);
    expect(result.impact?.max_depth_reached).toBe(false);

    // 人读双形态：family/采纳边/空态措辞齐备。
    const human = outcome.human.join("\n");
    expect(human).toContain(`graph ${PAGE_ID} → family=UI kind=page_surface`);
    expect(human).toContain("catalog:PAGE_ARCHETYPE.MASTER_DATA");
    expect(human).toContain("reverse dependents（反向 dependents）: (无边登记——零边≠无依赖");
  });

  it("API_REQ 根：family=INTERFACE + forward READS / reverse CALLS 双向分组 + 闭包回 PAGE（depth1）", async () => {
    await seedSupplierGraph();
    const outcome = await runGraph({ id: API_ID, rootDir: root });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as GraphResult;
    expect(result.object?.family).toBe("INTERFACE");
    expect(result.relations_touching).toBe(2);
    expect(result.forward_dependencies?.map((group) => group.type)).toEqual(["READS"]);
    expect(result.forward_dependencies?.[0]?.edges[0]?.endpoint.id).toBe(FIELD_ID);
    expect(result.reverse_dependents?.map((group) => group.type)).toEqual(["CALLS"]);
    expect(result.reverse_dependents?.[0]?.edges[0]?.endpoint.id).toBe(PAGE_ID);
    expect(result.instance_of).toEqual([]);
    expect(result.impact?.affected).toEqual([
      {
        domain: "truth",
        id: PAGE_ID,
        depth: 1,
        via_edge_id: expect.any(String),
        via_edge_type: "CALLS",
      },
    ]);
  });

  it("机读 --json 信封五键 + 人读/机读重跑字节一致（确定性呈现）", async () => {
    await seedSupplierGraph();
    const first = await runGraph({ id: PAGE_ID, rootDir: root });
    const second = await runGraph({ id: PAGE_ID, rootDir: root });
    expect(JSON.stringify(second.result)).toBe(JSON.stringify(first.result));
    expect(JSON.stringify(second.human)).toBe(JSON.stringify(first.human));

    const lines: string[] = [];
    const code = await runCli(["--dir", root, "graph", PAGE_ID, "--json"], {
      stdout: (line) => lines.push(line),
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<GraphResult>;
    expect(Object.keys(envelope).sort()).toEqual(["command", "errors", "ok", "result", "warnings"]);
    expect(envelope.command).toBe("graph");
    expect(envelope.ok).toBe(true);
    expect(envelope.result.object?.family).toBe("UI");
    expect(envelope.errors).toEqual([]);
  });
});

// ============================================================
// --view impact（只出闭包段）
// ============================================================

describe("runGraph --view impact（只出闭包段）", () => {
  it("FIELD 根闭包 = API_REQ(depth1 via READS)→PAGE(depth2 via CALLS)；其余段显式 null", async () => {
    await seedSupplierGraph();
    const outcome = await runGraph({ id: FIELD_ID, view: "impact", rootDir: root });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as GraphResult;
    expect(result.view).toBe("impact");
    expect(result.object).toBeNull();
    expect(result.instance_of).toBeNull();
    expect(result.forward_dependencies).toBeNull();
    expect(result.reverse_dependents).toBeNull();
    expect(result.impact?.root).toEqual({ domain: "truth", id: FIELD_ID });
    expect(result.impact?.affected).toEqual([
      {
        domain: "truth",
        id: API_ID,
        depth: 1,
        via_edge_id: expect.stringMatching(/^EDGE-[0-9a-f]{12}$/),
        via_edge_type: "READS",
      },
      {
        domain: "truth",
        id: PAGE_ID,
        depth: 2,
        via_edge_id: expect.stringMatching(/^EDGE-[0-9a-f]{12}$/),
        via_edge_type: "CALLS",
      },
    ]);
    expect(result.impact?.max_depth_reached).toBe(false);
    const human = outcome.human.join("\n");
    expect(human).toContain("view=impact");
    expect(human).toContain("depth=2 truth:PAGE.SUPPLIER_MANAGEMENT via CALLS");
    expect(human).not.toContain("instance_of");
  });

  it("max-depth=1 截断 → affected 只剩 depth1 + max_depth_reached=true 显式呈现（禁静默）", async () => {
    await seedSupplierGraph();
    const outcome = await runGraph({ id: FIELD_ID, view: "impact", maxDepth: "1", rootDir: root });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as GraphResult;
    expect(result.max_depth).toBe(1);
    expect(result.impact?.affected).toHaveLength(1);
    expect(result.impact?.affected[0]?.id).toBe(API_ID);
    expect(result.impact?.max_depth_reached).toBe(true);
    expect(outcome.human.join("\n")).toContain("max_depth_reached=true");
  });

  it("max-depth=0 → kernel 域闸 SCHEMA_INVALID fail-closed（防御失控 BFS）", async () => {
    await seedSupplierGraph();
    const outcome = await runGraph({ id: FIELD_ID, maxDepth: "0", rootDir: root });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});

// ============================================================
// 空态显式 + 纯读零写入
// ============================================================

describe("runGraph 空态与纯读零写入", () => {
  it("零边对象 → 五处「无边登记」显式空态（NO_MATCH 纪律：零边≠无依赖；relations.jsonl 缺席容忍）", async () => {
    await seedLonelyObject();
    const outcome = await runGraph({ id: "PAGE.LONELY_PAGE", rootDir: root });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as GraphResult;
    expect(result.relations_touching).toBe(0);
    expect(result.instance_of).toEqual([]);
    expect(result.forward_dependencies).toEqual([]);
    expect(result.reverse_dependents).toEqual([]);
    expect(result.impact?.affected).toEqual([]);
    const human = outcome.human.join("\n");
    expect(human.split("无边登记").length - 1).toBe(5);
  });

  it("纯读零写入：执行前后 .pomaster 全树字节不变（A1 出口判据，inspect.spec 先例）", async () => {
    await seedSupplierGraph();
    const before = snapshot();
    const all = await runGraph({ id: PAGE_ID, rootDir: root });
    expect(all.ok).toBe(true);
    const impact = await runGraph({ id: FIELD_ID, view: "impact", rootDir: root });
    expect(impact.ok).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it("侧车缺失的存量 store 上照常可读且零重建（graph 不调 createStore——ensureSidecars 复发即 fail）", async () => {
    await seedSupplierGraph();
    stripSidecars();
    const before = snapshot();
    const outcome = await runGraph({ id: PAGE_ID, rootDir: root });
    expect(outcome.ok).toBe(true);
    expect(outcome.result?.relations_touching).toBe(2);
    expect(snapshot()).toEqual(before);
  });

  it("命令面钉版：graph 已注册进程序注册表（README 广告面由 readme-command-surface 双向钉住）", () => {
    const program = createProgram();
    expect(program.commands.map((command) => command.name())).toContain("graph");
  });
});
