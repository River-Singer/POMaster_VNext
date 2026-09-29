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
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PROTOCOL_ID_PATTERN,
  SPEC_ROUTING_MANIFEST_FILE,
  SPEC_ROUTING_SCHEMA,
  SPEC_ROUTING_STAGE_VALUES,
  loadSpecRoutingManifest,
} from "@pomaster/kernel";
import { resolveCatalogRoot } from "@pomaster/kernel";

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
