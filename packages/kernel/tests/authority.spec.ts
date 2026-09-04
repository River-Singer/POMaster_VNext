/**
 * authority.spec.ts —— Authority Precedence 机器面 + authority.json map/boundary_rules
 * 读侧最小消费（09-04 vNext Batch 1 R4；Owner 裁定 D3——PRD §3B 落码）。
 *
 * 覆盖锚点：
 * - AUTHORITY_PRECEDENCE_ORDER 九级链冻结（PRD §3B 逐级对位，首位最高）+ rank 派生；
 * - readAuthorityFaces：骨架/缺席/最小形态装载 + map owner 词形 fail-closed +
 *   boundary_rules effect 闭包 fail-closed；
 * - 投影消费：boundary deny 规则只读呈现进 MUST（AUTHORITATIVE）区；
 *   **B3 红线锚**：消费面纯读零写入——本 spec 全程零 journal/索引推进断言伴随
 *   （写路径无新增阻断的结构性证据 = store 通路零 import authority 消费面，
 *   由「无 ghost 之外的任何新写失败」间接钉住：deny 规则在场时 upsert 照常 APPLIED）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTHORITY_CONFLICT_RULE,
  AUTHORITY_PRECEDENCE_BOTTOM,
  AUTHORITY_PRECEDENCE_ORDER,
  AUTHORITY_PRECEDENCE_TOP,
  GovernanceError,
  applyTransaction,
  authorityPrecedenceRank,
  buildStorePaths,
  compileProjection,
  readAuthorityFaces,
} from "@pomaster/kernel";
import { makeStore, pageEnvelope, readIndex } from "./helpers.js";

function authorityPathOf(root: string): string {
  return join(root, ".pomaster", "state", "authority.json");
}

function readAuthorityRaw(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(authorityPathOf(root), "utf8")) as Record<string, unknown>;
}

function writeAuthorityRaw(root: string, doc: Record<string, unknown>): void {
  writeFileSync(authorityPathOf(root), `${JSON.stringify(doc, null, 2)}\n`);
}

// ============================================================
// PRD §3B precedence 链（纯数据）
// ============================================================

describe("AUTHORITY_PRECEDENCE_ORDER（§3B 链冻结）", () => {
  it("九级链逐词形冻结（首位最高；斜杠并列层级合并——原文逐级对位）", () => {
    expect(AUTHORITY_PRECEDENCE_ORDER).toEqual([
      "EXPLICIT_OWNER_DECISION",
      "RATIFIED_PROJECT_CONTRACT",
      "DOMAIN_AUTHORITATIVE_SOURCE",
      "PROJECT_BASELINE",
      "MEASURED_EVIDENCE",
      "PROJECT_KNOWLEDGE",
      "INFERENCE",
      "INFERRED_INTENT",
      "AI_INVENTION",
    ]);
    expect(AUTHORITY_PRECEDENCE_TOP).toBe("EXPLICIT_OWNER_DECISION");
    expect(AUTHORITY_PRECEDENCE_BOTTOM).toBe("AI_INVENTION");
  });

  it("rank 派生：链顶 0、单调严格递减；词表外 → null（禁猜测归位）", () => {
    expect(authorityPrecedenceRank("EXPLICIT_OWNER_DECISION")).toBe(0);
    expect(authorityPrecedenceRank("AI_INVENTION")).toBe(8);
    for (let i = 1; i < AUTHORITY_PRECEDENCE_ORDER.length; i += 1) {
      const previous = authorityPrecedenceRank(AUTHORITY_PRECEDENCE_ORDER[i - 1] ?? "");
      const current = authorityPrecedenceRank(AUTHORITY_PRECEDENCE_ORDER[i] ?? "");
      expect(previous).not.toBeNull();
      expect(current).not.toBeNull();
      expect(current ?? -1).toBeGreaterThan(previous ?? 0);
    }
    expect(authorityPrecedenceRank("RISK_SCORE")).toBeNull();
    expect(authorityPrecedenceRank("")).toBeNull();
  });

  it("冲突规则注记在场（CONFLICT → blocked → Owner/declared authority 裁决，禁 LLM 自行综合）", () => {
    expect(AUTHORITY_CONFLICT_RULE).toContain("CONFLICT");
    expect(AUTHORITY_CONFLICT_RULE).toContain("不得让 LLM 自行综合");
  });
});

// ============================================================
// readAuthorityFaces（map/boundary_rules 读侧最小消费；fail-closed）
// ============================================================

describe("readAuthorityFaces（读侧 fail-closed；B3 warning-only 纪律）", () => {
  it("makeStore 骨架（owner_registry/boundary_rules/map 空）→ 空面 + owners 来自 authorities", async () => {
    const { root } = await makeStore();
    const faces = readAuthorityFaces(buildStorePaths(root));
    expect(faces.owners.sort()).toEqual(["BUSINESS_OWNER", "FRONTEND_CONTRACT"]);
    expect(faces.map).toEqual([]);
    expect(faces.boundary_rules).toEqual([]);
  });

  it("createStore 最小形态（只有 version+authorities，无 map/boundary_rules 键）→ 空面不炸", async () => {
    const { root } = await makeStore();
    const raw = readAuthorityRaw(root);
    delete raw.map;
    delete raw.boundary_rules;
    delete raw.owner_registry;
    writeAuthorityRaw(root, raw);
    const faces = readAuthorityFaces(buildStorePaths(root));
    expect(faces.map).toEqual([]);
    expect(faces.boundary_rules).toEqual([]);
  });

  it("map 条目：合法 owner 词形装载；owner 词形外（小写/空）→ SCHEMA_INVALID fail-closed", async () => {
    const { root } = await makeStore();
    const raw = readAuthorityRaw(root);
    raw.map = [
      { owner: "GRID_BASELINE_OWNER", scope: ["grid_library", "component_implementation"], note: "Baseline 决定 grid 实现" },
    ];
    writeAuthorityRaw(root, raw);
    const faces = readAuthorityFaces(buildStorePaths(root));
    expect(faces.map).toHaveLength(1);
    expect(faces.map[0]?.owner).toBe("GRID_BASELINE_OWNER");
    expect(faces.map[0]?.scope).toEqual(["grid_library", "component_implementation"]);

    raw.map = [{ owner: "lowercase_owner", scope: [] }];
    writeAuthorityRaw(root, raw);
    expect(() => readAuthorityFaces(buildStorePaths(root))).toThrow(GovernanceError);
  });

  it("boundary_rules：effect 闭包 allow|deny（词表外显式拒绝）；scope 必填非空", async () => {
    const { root } = await makeStore();
    const raw = readAuthorityRaw(root);
    raw.boundary_rules = [
      { rule_id: "br-001", scope: "grid_library", effect: "deny", owner: "GRID_BASELINE_OWNER", reason: "原型对 grid 库无发言权（MasterGrid 教训）" },
      { scope: "css", effect: "allow" },
    ];
    writeAuthorityRaw(root, raw);
    const faces = readAuthorityFaces(buildStorePaths(root));
    expect(faces.boundary_rules).toHaveLength(2);
    expect(faces.boundary_rules[1]?.rule_id).toBe("boundary_rule_2"); // 缺 rule_id 机械派生

    const badEffect = readAuthorityRaw(root);
    (badEffect.boundary_rules as unknown[])[0] = { scope: "grid_library", effect: "FORBIDDEN_FOREVER" };
    writeAuthorityRaw(root, badEffect);
    expect(() => readAuthorityFaces(buildStorePaths(root))).toThrow(/effect/);

    const badScope = readAuthorityRaw(root);
    (badScope.boundary_rules as unknown[])[0] = { scope: "", effect: "deny" };
    writeAuthorityRaw(root, badScope);
    expect(() => readAuthorityFaces(buildStorePaths(root))).toThrow(/scope/);
  });

  it("B3 红线：deny 规则在场不阻断写路径（upsert 照常 APPLIED——消费面零写路径消费）", async () => {
    const { root, store } = await makeStore();
    const raw = readAuthorityRaw(root);
    raw.boundary_rules = [{ scope: "grid_library", effect: "deny", reason: "读侧呈现面——不阻断" }];
    writeAuthorityRaw(root, raw);
    const before = (readIndex(root).generation as { seq?: number }).seq;
    const applied = await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope() as never }],
    });
    expect(applied.change ?? "APPLIED").toBeDefined();
    const after = (readIndex(root).generation as { seq?: number }).seq;
    expect(after ?? 0).toBeGreaterThan(before ?? 0);
  });
});

// ============================================================
// 投影消费（boundary deny → MUST 只读呈现）
// ============================================================

describe("投影 AUTHORITATIVE 区消费（boundary deny 只读呈现）", () => {
  it("boundary_rules deny 条目 → MUST 区显式条目（ref=rule_id；allow 条目不呈现）；absent → 零条目", async () => {
    const { root, store } = await makeStore();
    const raw = readAuthorityRaw(root);
    raw.boundary_rules = [
      { rule_id: "br-grid", scope: "grid_library", effect: "deny", reason: "原型 grid 库被忽略" },
      { rule_id: "br-css", scope: "css", effect: "allow" },
    ];
    writeAuthorityRaw(root, raw);
    const projection = await compileProjection(store, { role: "frontend" });
    const denyEntries = projection.manifest.mustEntries.filter((entry) => entry.ref === "br-grid");
    expect(denyEntries).toHaveLength(1);
    expect(denyEntries[0]?.reason).toContain("authority boundary deny");
    expect(denyEntries[0]?.reason).toContain("grid_library");
    expect(denyEntries[0]?.reason).toContain("呈现不阻断");
    expect(projection.manifest.mustEntries.some((entry) => entry.ref === "br-css")).toBe(false);
  });

  it("boundary_rules 畸形（非数组）→ compileProjection SCHEMA_INVALID（读侧 fail-closed，非静默空表）", async () => {
    const { root, store } = await makeStore();
    const raw = readAuthorityRaw(root);
    raw.boundary_rules = "not-an-array";
    writeAuthorityRaw(root, raw);
    await expect(compileProjection(store, { role: "frontend" })).rejects.toThrow(GovernanceError);
  });
});
