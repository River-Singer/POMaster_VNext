/**
 * spec-routing.spec.ts —— 协议目录路由（W4 切片；FR-02 Spec Catalog 路由；AC-09/10）。
 *
 * 三道守门：
 * 1) 装载面（W4.1 最小可路由字段定稿）：catalog 根下 spec-routing.json 的共享读取器——
 *    semantic_id（机器身份，PROTOCOL.* 词形）/ path（内容导航）/ stage / triggers / stack /
 *    superseded_by（显式退役，禁 mtime/文件名推断）/ requires / conflicts / source_sha256
 *    （编译时登记来源指纹）逐字段 fail-closed 校验；manifest 缺席 = opt-in 空路由（null
 *    显式返回，非静默空表）；unknown 键 fail-closed（unknown 字段不静默当匹配）。
 * 2) 路由核（W4.2 选择与解释）：确定性纯函数——supersession 闸 → 命中通道并集
 *    （always 基线 ∪ trigger 精确交集 ∪ 显式 reference）→ stage 过滤闸 → stack 过滤闸
 *    （not_configured 不假绿）→ requires 依赖迭代剔除（缺依赖不静默当匹配）→ conflicts
 *    登记序去重；每份协议输出命中理由 + 来源身份/指纹；同输入重放字节稳定。
 * 3) 投影接线与验收（W4.2/W4.3）：路由结果进 catalogEntries（REUSE / CATALOG 分区，
 *    不进 mustEntries 判卷输入——§92.2）；AG Grid 编辑保存样例精准命中不全量加载；
 *    必要协议超过 3–8 目标时不为凑数截断。
 *
 * MASTer 业务特例边界：AG Grid 等协议条目只以测试 fixture（project overlay 语义演示）
 * 存在，不进 repo universal seed（catalog/spec-routing.json 实物零条目）。
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PROTOCOL_ID_PATTERN,
  SPEC_ROUTING_MANIFEST_FILE,
  SPEC_ROUTING_SCHEMA,
  SPEC_ROUTING_STAGE_VALUES,
  compileProjection,
  explainCatalogProjection,
  loadSpecRoutingManifest,
  resolveCatalogRoot,
  routeSpecs,
  verifySpecRoutingSource,
} from "@pomaster/kernel";
import { makeStore } from "./helpers.js";
import { fixtureProtocolBody, routingFixtureEntries, sha } from "./spec-routing-fixtures.js";

const REPO_CATALOG = resolveCatalogRoot();

/** 合法最小条目（fixture 基线；逐用例覆写字段构造场景）。 */
function validEntry(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    semantic_id: "PROTOCOL.FRONTEND.DATA_GRID",
    path: ".trellis/spec/frontend/30-data-grid-protocol.md",
    stage: ["implement"],
    triggers: ["data-grid", "ag-grid"],
    stack: ["vue", "ag-grid"],
    always: false,
    superseded_by: null,
    requires: [],
    conflicts: [],
    source_sha256: `sha256:${"a".repeat(64)}`,
    ...overrides,
  };
}

/** 写临时 catalog 根下的 spec-routing manifest 并装载（返回 loader 结果或捕获的错误码）。 */
function loadWithEntries(entries: unknown[], extra?: Record<string, unknown>): {
  manifest: ReturnType<typeof loadSpecRoutingManifest>;
  catalogRoot: string;
} {
  const tempRoot = mkdtempSync(join(tmpdir(), "pomaster-spec-routing-"));
  const catalogRoot = join(tempRoot, "catalog");
  cpSync(REPO_CATALOG, catalogRoot, { recursive: true });
  tempRoots.push(catalogRoot);
  writeFileSync(
    join(catalogRoot, SPEC_ROUTING_MANIFEST_FILE),
    `${JSON.stringify({ schema: SPEC_ROUTING_SCHEMA, profile: "project-overlay", entries, ...extra }, null, 2)}\n`,
    "utf8",
  );
  let manifest: ReturnType<typeof loadSpecRoutingManifest>;
  try {
    manifest = loadSpecRoutingManifest(catalogRoot);
  } catch (error) {
    manifest = error as never;
  }
  return { manifest, catalogRoot };
}

/** 期望 SCHEMA_INVALID 且消息含片段。 */
function expectInvalid(manifest: unknown, messagePart: string): void {
  expect((manifest as { code?: string }).code).toBe("SCHEMA_INVALID");
  expect((manifest as Error).message).toContain(messagePart);
}

let tempRoots: string[] = [];

beforeEach(() => {
  tempRoots = [];
});

afterEach(() => {
  for (const root of tempRoots) rmSync(dirname(root), { recursive: true, force: true });
});

// ============================================================
// 1) 装载面（W4.1 最小可路由字段定稿）
// ============================================================

describe("loadSpecRoutingManifest（repo 实物 + 词形定稿）", () => {
  it("repo 实物：universal seed 空 manifest（schema/profile/entries=0——机制 opt-in 在座，MASTer 特例不进 seed）", () => {
    const manifest = loadSpecRoutingManifest(REPO_CATALOG);
    expect(manifest).not.toBeNull();
    expect(manifest?.schema).toBe("pomaster.spec-routing/1");
    expect(manifest?.profile).toBe("universal-seed");
    expect(manifest?.entries).toEqual([]);
  });

  it("manifest 缺席 → null（opt-in 空路由显式返回，非静默空表）", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "pomaster-spec-routing-absent-"));
    const catalogRoot = join(tempRoot, "catalog");
    cpSync(REPO_CATALOG, catalogRoot, { recursive: true });
    tempRoots.push(catalogRoot);
    rmSync(join(catalogRoot, SPEC_ROUTING_MANIFEST_FILE));
    expect(loadSpecRoutingManifest(catalogRoot)).toBeNull();
  });

  it("词形常量：PROTOCOL.* 点族 + stage 四值闭包 + manifest 文件名", () => {
    expect(PROTOCOL_ID_PATTERN.test("PROTOCOL.FRONTEND.DATA_GRID")).toBe(true);
    expect(PROTOCOL_ID_PATTERN.test("PROTOCOL.GRID")).toBe(false); // 至少两段
    expect(PROTOCOL_ID_PATTERN.test("SPEC.FRONTEND.DATA_GRID")).toBe(false); // SPEC. 是 governed id 前缀（Evidence Spec），禁借用
    expect(PROTOCOL_ID_PATTERN.test("protocol.frontend.data_grid")).toBe(false);
    expect(SPEC_ROUTING_STAGE_VALUES).toEqual(["plan", "implement", "verify", "maintain"]);
    expect(SPEC_ROUTING_MANIFEST_FILE).toBe("spec-routing.json");
  });

  it("合法条目完整装载：逐字段回读（semantic_id/path/stage/triggers/stack/always/superseded_by/requires/conflicts/source_sha256/note）", () => {
    const { manifest } = loadWithEntries([
      validEntry({
        note: "MASTer overlay 演示条目（项目特例不进 universal seed）",
        superseded_by: null,
      }),
    ]);
    expect(manifest).not.toBeNull();
    expect(manifest?.entries).toHaveLength(1);
    const entry = manifest?.entries[0];
    expect(entry?.semantic_id).toBe("PROTOCOL.FRONTEND.DATA_GRID");
    expect(entry?.path).toBe(".trellis/spec/frontend/30-data-grid-protocol.md");
    expect(entry?.stage).toEqual(["implement"]);
    expect(entry?.triggers).toEqual(["data-grid", "ag-grid"]);
    expect(entry?.stack).toEqual(["vue", "ag-grid"]);
    expect(entry?.always).toBe(false);
    expect(entry?.superseded_by).toBeNull();
    expect(entry?.requires).toEqual([]);
    expect(entry?.conflicts).toEqual([]);
    expect(entry?.source_sha256).toBe(`sha256:${"a".repeat(64)}`);
    expect(entry?.note).toBe("MASTer overlay 演示条目（项目特例不进 universal seed）");
  });

  it("字段缺席诚实缺省：stage/triggers/stack/requires/conflicts 缺席=空数组、always=false、superseded_by=null、note=null", () => {
    const { manifest } = loadWithEntries([
      {
        semantic_id: "PROTOCOL.FRONTEND.DEV_CHECKLIST",
        path: ".trellis/spec/frontend/01-development-checklist-protocol.md",
        source_sha256: `sha256:${"b".repeat(64)}`,
      },
    ]);
    expect(manifest).not.toBeNull();
    const entry = manifest?.entries[0];
    expect(entry?.stage).toEqual([]);
    expect(entry?.triggers).toEqual([]);
    expect(entry?.stack).toEqual([]);
    expect(entry?.always).toBe(false);
    expect(entry?.superseded_by).toBeNull();
    expect(entry?.requires).toEqual([]);
    expect(entry?.conflicts).toEqual([]);
    expect(entry?.note).toBeNull();
  });
});

describe("loadSpecRoutingManifest fail-closed（坏物料显式爆，禁静默当空）", () => {
  function expectEntryInvalid(entries: unknown[], messagePart: string): void {
    const { manifest } = loadWithEntries(entries);
    expectInvalid(manifest, messagePart);
  }

  it("顶层 schema 词形错 / profile 缺失 / entries 非数组 → SCHEMA_INVALID", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "pomaster-spec-routing-bad-"));
    const catalogRoot = join(tempRoot, "catalog");
    cpSync(REPO_CATALOG, catalogRoot, { recursive: true });
    tempRoots.push(catalogRoot);
    const writeManifest = (body: string): void => {
      writeFileSync(join(catalogRoot, SPEC_ROUTING_MANIFEST_FILE), body, "utf8");
    };
    writeManifest("{ not json");
    try {
      loadSpecRoutingManifest(catalogRoot);
      expect.unreachable("必须抛出");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("SCHEMA_INVALID");
    }
    const expectManifestInvalid = (messagePart: string): void => {
      try {
        loadSpecRoutingManifest(catalogRoot);
        expect.unreachable("必须抛出");
      } catch (error) {
        expectInvalid(error, messagePart);
      }
    };
    writeManifest(`${JSON.stringify({ schema: "pomaster.other/1", profile: "p", entries: [] })}\n`);
    expectManifestInvalid("schema");
    writeManifest(`${JSON.stringify({ schema: SPEC_ROUTING_SCHEMA, entries: [] })}\n`);
    expectManifestInvalid("profile");
    writeManifest(`${JSON.stringify({ schema: SPEC_ROUTING_SCHEMA, profile: "p", entries: {} })}\n`);
    expectManifestInvalid("entries");
  });

  it("semantic_id 词形非法（非 PROTOCOL 前缀 / 单段）/ 缺失 → SCHEMA_INVALID", () => {
    expectEntryInvalid([validEntry({ semantic_id: "SPEC.FRONTEND.DATA_GRID" })], "semantic_id");
    expectEntryInvalid([validEntry({ semantic_id: "PROTOCOL" })], "semantic_id");
    expectEntryInvalid([{ path: "x.md", source_sha256: `sha256:${"a".repeat(64)}` }], "semantic_id");
  });

  it("semantic_id 重复（身份面禁重复）→ SCHEMA_INVALID", () => {
    expectEntryInvalid(
      [validEntry(), validEntry({ path: ".trellis/spec/frontend/other.md" })],
      "重复",
    );
  });

  it("path 缺失 / 空字符串 → SCHEMA_INVALID（path 是内容导航位，缺席禁杜撰）", () => {
    expectEntryInvalid(
      [{ semantic_id: "PROTOCOL.FRONTEND.DATA_GRID", source_sha256: `sha256:${"a".repeat(64)}` }],
      "path",
    );
    expectEntryInvalid([validEntry({ path: "" })], "path");
  });

  it("stage 词表外 / 非数组 → SCHEMA_INVALID（四值闭包；扩值走词汇表 PR）", () => {
    expectEntryInvalid([validEntry({ stage: ["coding"] })], "stage");
    expectEntryInvalid([validEntry({ stage: "implement" })], "stage");
  });

  it("triggers / stack 词形非法（大写 / 含空白）→ SCHEMA_INVALID（词级精确 token 纪律）", () => {
    expectEntryInvalid([validEntry({ triggers: ["Data Grid"] })], "triggers");
    expectEntryInvalid([validEntry({ stack: ["Vue3"] })], "stack");
    expectEntryInvalid([validEntry({ triggers: ["data grid"] })], "triggers");
  });

  it("source_sha256 缺失 / 词形非法 → SCHEMA_INVALID（来源指纹显式登记，禁 mtime 推断）", () => {
    expectEntryInvalid(
      [{ semantic_id: "PROTOCOL.FRONTEND.DATA_GRID", path: "x.md" }],
      "source_sha256",
    );
    expectEntryInvalid([validEntry({ source_sha256: "mtime:2026-09-30" })], "source_sha256");
  });

  it("always 与 stage/stack 互斥声明 → SCHEMA_INVALID（always=无条件基线，语义单一化）", () => {
    expectEntryInvalid([validEntry({ always: true })], "always");
    expectEntryInvalid(
      [validEntry({ always: true, stack: [], stage: ["implement"] })],
      "always",
    );
  });

  it("unknown 键 → SCHEMA_INVALID（entry 键闭包——unknown 字段不静默当匹配）", () => {
    expectEntryInvalid([validEntry({ priority: 3 })], "未知字段");
  });

  it("悬空引用：superseded_by / requires / conflicts 指向不在册 id → SCHEMA_INVALID（ref-integrity 纪律）", () => {
    expectEntryInvalid(
      [validEntry({ superseded_by: "PROTOCOL.FRONTEND.NO_SUCH" })],
      "不在册",
    );
    expectEntryInvalid(
      [validEntry({ requires: ["PROTOCOL.FRONTEND.NO_SUCH"] })],
      "不在册",
    );
    expectEntryInvalid(
      [validEntry({ conflicts: ["PROTOCOL.FRONTEND.NO_SUCH"] })],
      "不在册",
    );
  });

  it("自引用（requires/conflicts/superseded_by 含自身）→ SCHEMA_INVALID", () => {
    const self = "PROTOCOL.FRONTEND.DATA_GRID";
    expectEntryInvalid([validEntry({ requires: [self] })], "自引用");
    expectEntryInvalid([validEntry({ conflicts: [self] })], "自引用");
    expectEntryInvalid([validEntry({ superseded_by: self })], "自引用");
  });
});

// ============================================================
// 2) 路由核（W4.2 选择与解释：确定性纯函数）
// ============================================================

/**
 * 从装载面构造 manifest（复用词形校验，防 fixture 本身坏形；走磁盘装载——与
 * pureManifest 对象直构互补，fixture 词形回归由本出口钉住）。
 */
function fixtureManifest(entries: Record<string, unknown>[] = routingFixtureEntries()) {
  const { manifest } = loadWithEntries(entries);
  if (manifest === null || manifest instanceof Error) throw new Error("fixture 坏形");
  return manifest;
}

function includedIds(decisions: readonly { semantic_id: string; included: boolean }[]): string[] {
  return decisions.filter((d) => d.included).map((d) => d.semantic_id);
}

describe("routeSpecs（W4.2 确定性路由核：通道/闸/依赖/冲突）", () => {
  const GRID = "PROTOCOL.FRONTEND.DATA_GRID";
  const FORM = "PROTOCOL.FRONTEND.FORM";
  const TESTING = "PROTOCOL.FRONTEND.TESTING";
  const MOCK = "PROTOCOL.FRONTEND.MOCK";
  const BE_API = "PROTOCOL.BACKEND.REQUEST_API";
  const OLD = "PROTOCOL.FRONTEND.OLD_GRID";
  const GATE = "PROTOCOL.FRONTEND.ACCEPTANCE_GATE";

  it("always 基线：空输入恒命中（channels=[always]）；无通道条目显式排除", () => {
    const decisions = routeSpecs(fixtureManifest(), {
      stage: null,
      triggers: [],
      stack: null,
      specRefs: [],
    });
    expect(includedIds(decisions)).toEqual([
      "PROTOCOL.FRONTEND.AI_CODE",
      "PROTOCOL.FRONTEND.DEV_CHECKLIST",
    ]);
    const theme = decisions.find((d) => d.semantic_id === "PROTOCOL.FRONTEND.THEME")!;
    expect(theme.included).toBe(false);
    expect(theme.why).toContain("无命中通道");
  });

  it("trigger 词级精确交集命中；禁子串猜测（grid ≠ data-grid）", () => {
    const decisions = routeSpecs(fixtureManifest(), {
      stage: null,
      triggers: ["data-grid"],
      stack: ["vue", "ag-grid"],
      specRefs: [],
    });
    const grid = decisions.find((d) => d.semantic_id === GRID)!;
    expect(grid.included).toBe(true);
    expect(grid.channels).toContain("trigger");
    expect(grid.why).toContain("data-grid");
    const substring = routeSpecs(fixtureManifest(), {
      stage: null,
      triggers: ["grid"],
      stack: ["vue", "ag-grid"],
      specRefs: [],
    });
    expect(includedIds(substring)).not.toContain(GRID);
  });

  it("stage 过滤闸：任务 stage=verify 时 implement-only 协议出、跨阶段协议留", () => {
    const decisions = routeSpecs(fixtureManifest(), {
      stage: "verify",
      triggers: ["test"],
      stack: null,
      specRefs: [],
    });
    expect(includedIds(decisions)).toContain(TESTING);
    const grid = decisions.find((d) => d.semantic_id === GRID)!;
    expect(grid.included).toBe(false);
    expect(grid.why).toContain("stage");
  });

  it("任务未提供 stage → stage 闸不参与（trigger 命中的声明 stage 协议仍可入选）", () => {
    const decisions = routeSpecs(fixtureManifest(), {
      stage: null,
      triggers: ["data-grid"],
      stack: ["vue", "ag-grid"],
      specRefs: [],
    });
    expect(includedIds(decisions)).toContain(GRID);
  });

  it("stack not_configured 不假绿：任务未声明 stack → 声明 stack 的协议显式排除", () => {
    const decisions = routeSpecs(fixtureManifest(), {
      stage: null,
      triggers: ["data-grid"],
      stack: null,
      specRefs: [],
    });
    const grid = decisions.find((d) => d.semantic_id === GRID)!;
    expect(grid.included).toBe(false);
    expect(grid.why).toContain("not_configured");
    expect(includedIds(decisions)).not.toContain(FORM);
  });

  it("stack 无交集：backend stack 任务不误选 frontend 协议（反向同理）", () => {
    const backend = routeSpecs(fixtureManifest(), {
      stage: "implement",
      triggers: ["save", "data-grid"],
      stack: ["fastapi"],
      specRefs: [],
    });
    expect(includedIds(backend)).toContain(BE_API);
    expect(includedIds(backend)).not.toContain(GRID);
    const gridWhy = backend.find((d) => d.semantic_id === GRID)!.why;
    expect(gridWhy).toContain("无交集");
  });

  it("缺依赖不静默当匹配：MOCK trigger 命中但依赖 TESTING 未随选 → MOCK 剔除且理由显式", () => {
    const decisions = routeSpecs(fixtureManifest(), {
      stage: null,
      triggers: ["edit-save"],
      stack: ["vue"],
      specRefs: [],
    });
    const mock = decisions.find((d) => d.semantic_id === MOCK)!;
    expect(mock.included).toBe(false);
    expect(mock.why).toContain("PROTOCOL.FRONTEND.TESTING");
    expect(mock.why).toContain("依赖");
  });

  it("传递依赖迭代剔除：A 无通道 → 依赖 A 的 B 剔除 → 依赖 B 的 C 随之剔除", () => {
    const manifest = fixtureManifest([
      { semantic_id: "PROTOCOL.X.A", path: "a.md", source_sha256: sha("a") },
      { semantic_id: "PROTOCOL.X.B", path: "b.md", triggers: ["b-go"], requires: ["PROTOCOL.X.A"], source_sha256: sha("b") },
      { semantic_id: "PROTOCOL.X.C", path: "c.md", triggers: ["c-go"], requires: ["PROTOCOL.X.B"], source_sha256: sha("c") },
    ]);
    const decisions = routeSpecs(manifest, {
      stage: null,
      triggers: ["b-go", "c-go"],
      stack: null,
      specRefs: [],
    });
    expect(includedIds(decisions)).toEqual([]);
    expect(decisions.find((d) => d.semantic_id === "PROTOCOL.X.C")!.why).toContain("PROTOCOL.X.B");
    expect(decisions.find((d) => d.semantic_id === "PROTOCOL.X.B")!.why).toContain("PROTOCOL.X.A");
  });

  it("conflicts 登记序去重：互斥对都命中时保留登记序在先者，后者理由显式", () => {
    const manifest = fixtureManifest([
      { semantic_id: "PROTOCOL.X.FIRST", path: "f.md", triggers: ["go"], conflicts: ["PROTOCOL.X.SECOND"], source_sha256: sha("f") },
      { semantic_id: "PROTOCOL.X.SECOND", path: "s.md", triggers: ["go"], conflicts: ["PROTOCOL.X.FIRST"], source_sha256: sha("s") },
    ]);
    const decisions = routeSpecs(manifest, {
      stage: null,
      triggers: ["go"],
      stack: null,
      specRefs: [],
    });
    expect(includedIds(decisions)).toEqual(["PROTOCOL.X.FIRST"]);
    expect(decisions.find((d) => d.semantic_id === "PROTOCOL.X.SECOND")!.why).toContain(
      "PROTOCOL.X.FIRST",
    );
  });

  it("显式 reference：点名绕过 stage 闸（verify-only 协议在 implement 任务下经点名入选）", () => {
    const decisions = routeSpecs(fixtureManifest(), {
      stage: "implement",
      triggers: [],
      stack: null,
      specRefs: [GATE],
    });
    const gate = decisions.find((d) => d.semantic_id === GATE)!;
    expect(gate.included).toBe(true);
    expect(gate.channels).toContain("explicit");
  });

  it("supersession 闸优先于显式 reference：点名退役协议仍排除且理由携带取代者", () => {
    const decisions = routeSpecs(fixtureManifest(), {
      stage: null,
      triggers: [],
      stack: null,
      specRefs: [OLD],
    });
    const old = decisions.find((d) => d.semantic_id === OLD)!;
    expect(old.included).toBe(false);
    expect(old.why).toContain(GRID);
    expect(old.why).toContain("superseded");
  });

  it("同输入重放字节稳定：两次调用 decisions deep equal；决策按 semantic_id 字典序", () => {
    const input = { stage: "implement" as const, triggers: ["edit-save", "data-grid"], stack: ["vue", "ag-grid"], specRefs: [] };
    const a = routeSpecs(fixtureManifest(), input);
    const b = routeSpecs(fixtureManifest(), input);
    expect(a).toEqual(b);
    const ids = a.map((d) => d.semantic_id);
    expect(ids).toEqual([...ids].sort());
  });

  it("改变 stage/stack 只影响相关候选：always 集恒定，diff 恰为声明了该轴的条目", () => {
    const base = { triggers: ["data-grid", "save"], stack: ["vue", "ag-grid"] as readonly string[] | null, specRefs: [] as readonly string[] };
    const implement = routeSpecs(fixtureManifest(), { ...base, stage: "implement" });
    const verify = routeSpecs(fixtureManifest(), { ...base, stage: "verify" });
    const alwaysIds = [
      "PROTOCOL.FRONTEND.AI_CODE",
      "PROTOCOL.FRONTEND.DEV_CHECKLIST",
    ];
    for (const id of alwaysIds) {
      expect(includedIds(implement)).toContain(id);
      expect(includedIds(verify)).toContain(id);
    }
    const implementOnly = includedIds(implement).filter((id) => !includedIds(verify).includes(id));
    expect(implementOnly).not.toContain(TESTING); // TESTING 声明 [implement, verify]——两侧都留
    expect(includedIds(verify)).not.toContain(MOCK); // MOCK stage=[implement]——verify 轮出
    const vue = routeSpecs(fixtureManifest(), { stage: null, triggers: ["data-grid"], stack: ["vue", "ag-grid"], specRefs: [] });
    const fastapi = routeSpecs(fixtureManifest(), { stage: null, triggers: ["data-grid"], stack: ["fastapi"], specRefs: [] });
    expect(includedIds(vue)).toContain(GRID);
    expect(includedIds(fastapi)).not.toContain(GRID);
  });

  it("included 决策携带来源身份/指纹：semantic_id + path + source_sha256 全在决策面", () => {
    const decisions = routeSpecs(fixtureManifest(), {
      stage: null,
      triggers: ["data-grid"],
      stack: ["vue", "ag-grid"],
      specRefs: [],
    });
    const grid = decisions.find((d) => d.semantic_id === GRID)!;
    expect(grid.path).toBe(".trellis/spec/frontend/30-data-grid-protocol.md");
    expect(grid.source_sha256).toBe(sha("30"));
  });
});

describe("validateApplicabilityInputs 扩展（W4.2 请求侧 fail-closed）", () => {
  it("stage 词表外 → SCHEMA_INVALID（compileProjection 与 explain 同款拒绝）", async () => {
    const { store } = await makeStore();
    try {
      await compileProjection(store, { role: "frontend", stage: "coding" });
      expect.unreachable("必须抛出");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("SCHEMA_INVALID");
      expect((error as Error).message).toContain("stage");
    }
  });

  it("triggers 词形非法（大写/空白）与 specRefs 非 PROTOCOL 词形 → SCHEMA_INVALID", async () => {
    const { store } = await makeStore();
    for (const request of [
      { role: "frontend", triggers: ["Data Grid"] },
      { role: "frontend", stack: ["Vue3"] },
      { role: "frontend", specRefs: ["SPEC.FRONTEND.DATA_GRID"] },
    ]) {
      try {
        await compileProjection(store, request as never);
        expect.unreachable("必须抛出");
      } catch (error) {
        expect((error as { code?: string }).code).toBe("SCHEMA_INVALID");
      }
    }
  });
});

// ============================================================
// 3) 投影接线（W4.2：路由结果进 catalogEntries，不进 mustEntries 判卷输入）
// ============================================================

/** 写入 AG Grid fixture manifest 的临时 catalog 根（每次调用独立副本；afterEach 清理）。 */
function specRoutingCatalogRoot(entries: Record<string, unknown>[] = routingFixtureEntries()): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "pomaster-spec-routing-root-"));
  const catalogRoot = join(tempRoot, "catalog");
  cpSync(REPO_CATALOG, catalogRoot, { recursive: true });
  tempRoots.push(catalogRoot);
  writeFileSync(
    join(catalogRoot, SPEC_ROUTING_MANIFEST_FILE),
    `${JSON.stringify({ schema: SPEC_ROUTING_SCHEMA, profile: "project-overlay", entries }, null, 2)}\n`,
    "utf8",
  );
  // 裁定 4b=C 对账 fixture 基线：正文随条目落盘（协议正文住消费项目——测试侧的
  // 「消费项目」即本临时根；fixtures sha() = sha256OfUtf8(正文) 同源，默认 fresh）。
  for (const entry of entries) {
    const path = entry["path"];
    const digest = entry["source_sha256"];
    if (typeof path !== "string" || typeof digest !== "string") continue;
    const bodyPath = join(catalogRoot, path);
    mkdirSync(dirname(bodyPath), { recursive: true });
    writeFileSync(bodyPath, fixtureBodyForDigest(digest), "utf8");
  }
  return catalogRoot;
}

/** 由登记指纹反查 fixture 正文（测试侧确定性映射——sha(tag) ≡ sha256OfUtf8(body(tag))）。 */
function fixtureBodyForDigest(digest: string): string {
  for (const tag of ["01", "02", "03", "30", "28", "14", "15", "20", "35", "be15", "30v1", "22"]) {
    if (sha(tag) === digest) return fixtureProtocolBody(tag);
  }
  return `orphan body for ${digest}\n`;
}

describe("compileProjection spec-routing 接线（W4.2）", () => {
  it("命中协议进 catalogEntries（reason 携 semantic_id/path/指纹/通道 + path 导航注记）；mustEntries 零 PROTOCOL.*", async () => {
    const { store } = await makeStore();
    const projection = await compileProjection(
      store,
      {
        role: "frontend",
        stage: "implement",
        triggers: ["edit-save", "data-grid", "ag-grid"],
        stack: ["vue", "ag-grid"],
      },
      { catalogRoot: specRoutingCatalogRoot() },
    );
    const refs = projection.manifest.catalogEntries.map((e) => e.ref);
    expect(refs).toContain("PROTOCOL.FRONTEND.DATA_GRID");
    expect(refs).toContain("PROTOCOL.FRONTEND.FORM");
    const grid = projection.manifest.catalogEntries.find((e) => e.ref === "PROTOCOL.FRONTEND.DATA_GRID")!;
    expect(grid.reason).toContain("semantic_id=PROTOCOL.FRONTEND.DATA_GRID");
    expect(grid.reason).toContain("30-data-grid-protocol.md");
    expect(grid.reason).toContain("source_sha256=");
    expect(grid.reason).toContain("path 仅");
    expect(
      projection.manifest.mustEntries.filter((e) => e.ref.startsWith("PROTOCOL.")),
    ).toEqual([]);
  });

  it("同输入重放：catalogEntries 与 inputsFingerprint 字节稳定（路由确定性 → 指纹确定性）", async () => {
    const { store } = await makeStore();
    const request = {
      role: "frontend",
      stage: "implement",
      triggers: ["edit-save", "data-grid"],
      stack: ["vue", "ag-grid"],
    };
    const a = await compileProjection(store, request, { catalogRoot: specRoutingCatalogRoot() });
    const b = await compileProjection(store, request, { catalogRoot: specRoutingCatalogRoot() });
    expect(a.inputsFingerprint).toBe(b.inputsFingerprint);
    expect(a.manifest.catalogEntries).toEqual(b.manifest.catalogEntries);
  });

  it("manifest 缺席（repo 空 seed）→ catalogEntries 零 PROTOCOL.* 且不爆（opt-in 空路由）", async () => {
    const { store } = await makeStore();
    const projection = await compileProjection(store, {
      role: "frontend",
      triggers: ["data-grid"],
      stack: ["vue"],
    });
    expect(
      projection.manifest.catalogEntries.filter((e) => e.ref.startsWith("PROTOCOL.")),
    ).toEqual([]);
  });

  it("explain decisions 分母保持 policy/presets 面（协议决策不混入 CatalogEntryDecision——隔离纪律）", async () => {
    const { store } = await makeStore();
    const explanation = await explainCatalogProjection(
      store,
      { role: "frontend", triggers: ["data-grid"] },
      { catalogRoot: specRoutingCatalogRoot() },
    );
    expect(
      explanation.decisions.filter((d) => d.ref.startsWith("PROTOCOL.")),
    ).toEqual([]);
  });
});

// ============================================================
// 4) 消费端 sha256 对账点（裁定 4b=C；Owner 2026-09-30）
//    背景：W4 协议路由的 source_sha256 是声明指纹（装载时不重算——协议正文住消费
//    项目，本仓不持有副本）。本面把它升级为「可验证声明」：context compile 消费协议
//    时按 path 读正文重算 sha256 并与声明对账——fresh 零行为变化（reason 面字节不变）；
//    不符=stale 显式标记；path 不可达=unjudgeable 显式（非静默通过、非崩溃）。
//    诚实边界：读到的正文即弃（不新增第二份正文副本——红线）；对账只降呈现可信度，
//    不阻断注入（策展面非判卷输入——§92.2 语义不变）。
// ============================================================

describe("消费端 sha256 对账点（裁定 4b=C：声明指纹 → 可验证声明）", () => {
  const GRID_PATH = ".trellis/spec/frontend/30-data-grid-protocol.md";

  it("对账核：声明与正文相符 → fresh（reason=null，actual=声明值——零行为变化基线）", () => {
    const root = specRoutingCatalogRoot();
    const declared = sha("30");
    const integrity = verifySpecRoutingSource(root, {
      semantic_id: "PROTOCOL.FRONTEND.DATA_GRID",
      path: GRID_PATH,
      source_sha256: declared,
    });
    expect(integrity.state).toBe("fresh");
    expect(integrity.reason).toBe(null);
    expect(integrity.actual_sha256).toBe(declared);
  });

  it("对账核：正文漂移 → stale（reason 携声明/现盘指纹——stale 显式非静默通过）", () => {
    const root = specRoutingCatalogRoot();
    const declared = sha("30");
    writeFileSync(join(root, GRID_PATH), "drifted body\n", "utf8");
    const integrity = verifySpecRoutingSource(root, {
      semantic_id: "PROTOCOL.FRONTEND.DATA_GRID",
      path: GRID_PATH,
      source_sha256: declared,
    });
    expect(integrity.state).toBe("stale");
    expect(integrity.reason).not.toBe(null);
    expect(integrity.reason).toContain("stale");
    expect(integrity.reason).toContain(declared);
    expect(integrity.actual_sha256).not.toBe(declared);
    expect(integrity.actual_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("对账核：path 不可达 → unjudgeable（显式缺席非崩溃；actual=null 不猜测）", () => {
    const root = specRoutingCatalogRoot();
    const integrity = verifySpecRoutingSource(root, {
      semantic_id: "PROTOCOL.FRONTEND.DATA_GRID",
      path: ".trellis/spec/frontend/vanished-protocol.md",
      source_sha256: sha("30"),
    });
    expect(integrity.state).toBe("unjudgeable");
    expect(integrity.reason).not.toBe(null);
    expect(integrity.reason).toContain("unjudgeable");
    expect(integrity.actual_sha256).toBe(null);
  });

  it("接线 fresh：正文在座且相符 → reason 无对账后缀（与既有形态字节一致）", async () => {
    const { store } = await makeStore();
    const projection = await compileProjection(
      store,
      { role: "frontend", stage: "implement", triggers: ["edit-save", "data-grid", "ag-grid"], stack: ["vue", "ag-grid"] },
      { catalogRoot: specRoutingCatalogRoot() },
    );
    const grid = projection.manifest.catalogEntries.find((e) => e.ref === "PROTOCOL.FRONTEND.DATA_GRID")!;
    expect(grid.reason).toContain("source_sha256=");
    expect(grid.reason).not.toContain("对账=");
  });

  it("接线 stale：正文被改 → reason 含对账=stale + 现盘指纹（呈现层 stale 标记 + 理由）", async () => {
    const root = specRoutingCatalogRoot();
    writeFileSync(join(root, GRID_PATH), "drifted body\n", "utf8");
    const { store } = await makeStore();
    const projection = await compileProjection(
      store,
      { role: "frontend", stage: "implement", triggers: ["edit-save", "data-grid", "ag-grid"], stack: ["vue", "ag-grid"] },
      { catalogRoot: root },
    );
    const grid = projection.manifest.catalogEntries.find((e) => e.ref === "PROTOCOL.FRONTEND.DATA_GRID")!;
    expect(grid.reason).toContain("对账=stale");
    expect(grid.reason).toContain("正文漂移");
    expect(grid.reason).toContain("sha256:");
  });

  it("接线 unjudgeable：登记 path 无正文 → reason 含对账=unjudgeable（显式不可判）", async () => {
    const root = specRoutingCatalogRoot();
    rmSync(join(root, GRID_PATH));
    const { store } = await makeStore();
    const projection = await compileProjection(
      store,
      { role: "frontend", stage: "implement", triggers: ["edit-save", "data-grid", "ag-grid"], stack: ["vue", "ag-grid"] },
      { catalogRoot: root },
    );
    const grid = projection.manifest.catalogEntries.find((e) => e.ref === "PROTOCOL.FRONTEND.DATA_GRID")!;
    expect(grid).toBeDefined();
    expect(grid.reason).toContain("对账=unjudgeable");
    expect(grid.reason).toContain("不可达");
  });
});
