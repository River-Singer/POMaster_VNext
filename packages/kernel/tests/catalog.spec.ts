/**
 * catalog.spec.ts —— Engineering Catalog 共享读取器（P14 Catalog→运行时联结）三道守门：
 *
 * 1) 读取面唯一：policies/tools/projection-presets 全部经 src/catalog.ts 从 catalog/
 *    实存目录读取；lane/enforcement/classification 对账 schemas 已登记 CATALOG_* 词形
 *    （vocab-lock catalog_layer_vocab，PR-0001），词表外/必填缺失 SCHEMA_INVALID
 *    fail-closed（坏物料 ≠ catalog 缺席，禁静默当空）。
 * 2) lock 校验（D24 read-side 指纹）：repo 实物全量对账 ok——producer 写入口径
 *    sha256(utf-8 字节) 与对账端同源；entries 分母 94（policies 79/gates 5/knowledge 10）。
 * 3) 漂移检出：临时 catalog 副本构造 content_drift / missing / unexpected_file /
 *    lock 缺失 → 显式检出（「catalog 物料被改而 lock 未重锁」的事故通道封死）。
 *
 * §92.2 边界注记：本模块只读 catalog/（策展源，非第二套 Project Truth）；漂移检出
 * 不修复不阻断消费（D24 write_blocking=false），修复动作 = producer 工具重锁。
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadCatalogPolicies,
  loadCatalogProjectionPresets,
  loadCatalogTools,
  readCatalogLock,
  resolveCatalogRoot,
  sha256OfUtf8,
  verifyCatalogLock,
} from "@pomaster/kernel";

const REPO_CATALOG = resolveCatalogRoot();

/** 临时 catalog 副本（漂移场景构造面；绝不改 repo 实物）。 */
function makeTempCatalog(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "pomaster-catalog-"));
  const catalogRoot = join(tempRoot, "catalog");
  cpSync(REPO_CATALOG, catalogRoot, { recursive: true });
  return catalogRoot;
}

let tempRoots: string[] = [];

beforeEach(() => {
  tempRoots = [];
});

afterEach(() => {
  for (const root of tempRoots) rmSync(dirname(root), { recursive: true, force: true });
});

function trackTempCatalog(): string {
  const catalogRoot = makeTempCatalog();
  tempRoots.push(catalogRoot);
  return catalogRoot;
}

// ============================================================
// 1) 读取面：定位 / lock 文档 / 物料清单
// ============================================================

describe("resolveCatalogRoot（缺省定位与显式注入）", () => {
  it("缺省定位到仓库 catalog/（实存目录；src 与 dist 同构上溯）", () => {
    expect(REPO_CATALOG.replace(/\\/g, "/").endsWith("/catalog")).toBe(true);
  });

  it("显式注入不存在的路径 → NOT_CONFIGURED（路径拼错 ≠ catalog 缺席，带路标）", () => {
    try {
      resolveCatalogRoot(join(tmpdir(), "pomaster-no-such-catalog-xyz"));
      expect.unreachable("必须抛出");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("NOT_CONFIGURED");
    }
  });
});

describe("readCatalogLock（lock 文档形态）", () => {
  it("版本/profile/entries 分母与排序（分母锁：94 entries，id 确定性排序）", () => {
    const lock = readCatalogLock(REPO_CATALOG);
    expect(lock.catalog_version).toBe("0.1.0-pilot");
    expect(lock.profile).toBe("web-standard@0");
    expect(lock.entries.length).toBe(94);
    expect(lock.controlled_children.allowed.length).toBe(94);
    expect(lock.controlled_children.required.length).toBe(94);
    const sorted = [...lock.entries].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(lock.entries).toEqual(sorted);
  });

  it("entries 哈希词形统一 sha256:<64hex>；source_ref 非空（provenance 纪律）", () => {
    for (const entry of readCatalogLock(REPO_CATALOG).entries) {
      expect(entry.content_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(entry.source_ref.length).toBeGreaterThan(0);
    }
  });
});

describe("loadCatalogPolicies（policies 物料读取）", () => {
  it("分母锁：79 条（authority.* 与 policy.* 同为 kind=policy）", () => {
    expect(loadCatalogPolicies(REPO_CATALOG).length).toBe(79);
  });

  it("抽查正文策展字段（单条 HTTP Client 政策逐字段对账物料原文）", () => {
    const policy = loadCatalogPolicies(REPO_CATALOG).find(
      (candidate) => candidate.id === "POLICY.WEB.API.SINGLE_HTTP_CLIENT",
    );
    expect(policy).toBeDefined();
    expect(policy?.file).toBe("policies/policy.web.api.single_http_client.json");
    expect(policy?.titleZh).toBe("HTTP Client 单点统一");
    expect(policy?.lane).toBe("frontend");
    expect(policy?.enforcement).toBe("required_when_applicable");
    expect(policy?.lifecycle).toBe("PROPOSED");
    expect(policy?.classification).toBe("LANE_POLICY");
  });

  it("lane 分布对账（any 43 / frontend 36 / backend 0；与 vocab-lock V7 词形一致）", () => {
    const policies = loadCatalogPolicies(REPO_CATALOG);
    expect(policies.filter((p) => p.lane === "any").length).toBe(43);
    expect(policies.filter((p) => p.lane === "frontend").length).toBe(36);
    expect(policies.filter((p) => p.lane === "backend").length).toBe(0);
  });

  it("坏物料 fail-closed：lane 词表外 → SCHEMA_INVALID（禁静默跳过当空）", () => {
    const catalogRoot = trackTempCatalog();
    const target = join(catalogRoot, "policies", "policy.web.api.single_http_client.json");
    const body = JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>;
    const appliesWhen = body["applies_when"] as Record<string, unknown>;
    appliesWhen["lane"] = "architect"; // 词表外值（V7 闭包：any/frontend/backend）
    writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    try {
      loadCatalogPolicies(catalogRoot);
      expect.unreachable("必须抛出");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("SCHEMA_INVALID");
      expect((error as Error).message).toContain("lane 词表外");
    }
  });
});

describe("loadCatalogTools / loadCatalogProjectionPresets", () => {
  it("tools 消费：3 份实存工具（懒加载清单分母）", () => {
    const tools = loadCatalogTools(REPO_CATALOG);
    expect(tools.map((tool) => tool.file).sort()).toEqual([
      "tools/apply_human_review_pilot_0001.py",
      "tools/materialize_batch4_uplift.py",
      "tools/materialize_catalog_pilot.py",
    ]);
  });

  it("projection-presets 消费：registry-tree 身份三元组（name/kind/status）", () => {
    const presets = loadCatalogProjectionPresets(REPO_CATALOG);
    expect(presets).toEqual([
      {
        file: "projection-presets/registry-tree.yaml",
        name: "registry-tree",
        kind: "projection_preset",
        status: "DRAFT",
      },
    ]);
  });
});

// ============================================================
// 2) lock 校验：repo 实物全量对账
// ============================================================

describe("verifyCatalogLock（repo 实物：producer 与对账端同口径）", () => {
  it("全量对账 ok：94 entries 哈希 + 管辖面双向对账零漂移", () => {
    const verification = verifyCatalogLock(REPO_CATALOG);
    expect(verification).toEqual({ ok: true, entries_checked: 94, drifts: [] });
  });
});

// ============================================================
// 3) 漂移检出（临时副本构造，绝不改 repo 实物）
// ============================================================

describe("verifyCatalogLock（漂移场景：物料被改而 lock 未重锁 → 显式检出）", () => {
  it("content_drift：改一个 policy 字节不重锁 → 精确指向该文件", () => {
    const catalogRoot = trackTempCatalog();
    const target = join(catalogRoot, "policies", "policy.web.api.single_http_client.json");
    const original = readFileSync(target, "utf8");
    writeFileSync(target, `${original}\n<!-- tampered -->\n`, "utf8");
    const verification = verifyCatalogLock(catalogRoot);
    expect(verification.ok).toBe(false);
    const drift = verification.drifts.find((candidate) => candidate.kind === "content_drift");
    expect(drift?.path).toBe("policies/policy.web.api.single_http_client.json");
    expect(drift?.detail).toContain("物料被改而 lock 未重锁");
  });

  it("missing + missing_required：删 required 管辖文件 → 双面检出", () => {
    const catalogRoot = trackTempCatalog();
    unlinkSync(join(catalogRoot, "policies", "policy.web.api.single_http_client.json"));
    const verification = verifyCatalogLock(catalogRoot);
    expect(verification.ok).toBe(false);
    expect(verification.drifts.map((drift) => drift.kind)).toContain("missing");
    expect(verification.drifts.map((drift) => drift.kind)).toContain("missing_required");
  });

  it("unexpected_file：管辖目录新增未登记文件 → 检出（allowed+required 双登记纪律）", () => {
    const catalogRoot = trackTempCatalog();
    writeFileSync(
      join(catalogRoot, "policies", "policy.foreign.rogue.json"),
      "{}\n",
      "utf8",
    );
    const verification = verifyCatalogLock(catalogRoot);
    const drift = verification.drifts.find((candidate) => candidate.kind === "unexpected_file");
    expect(drift?.path).toBe("policies/policy.foreign.rogue.json");
    expect(drift?.detail).toContain("allowed");
  });

  it("lock 缺失 → lock_unreadable（不抛异常，结构化漂移行呈现）", () => {
    const catalogRoot = trackTempCatalog();
    unlinkSync(join(catalogRoot, "catalog-lock.draft.json"));
    const verification = verifyCatalogLock(catalogRoot);
    expect(verification.ok).toBe(false);
    expect(verification.drifts).toEqual([
      expect.objectContaining({ kind: "lock_unreadable", path: "catalog-lock.draft.json" }),
    ]);
  });

  it("手动恢复字节（等价重锁语义）→ 校验回绿（漂移可修复性）", () => {
    const catalogRoot = trackTempCatalog();
    const target = join(catalogRoot, "policies", "policy.web.api.single_http_client.json");
    const original = readFileSync(target, "utf8");
    writeFileSync(target, `${original}\n<!-- tampered -->\n`, "utf8");
    expect(verifyCatalogLock(catalogRoot).ok).toBe(false);
    writeFileSync(target, original, "utf8");
    expect(verifyCatalogLock(catalogRoot).ok).toBe(true);
  });
});

describe("sha256OfUtf8（lock 同口径哈希）", () => {
  it("与 producer 写入口径一致（sha256(utf-8 字节)，词形 sha256:<64hex>）", () => {
    const lock = readCatalogLock(REPO_CATALOG);
    const entry = lock.entries.find(
      (candidate) => candidate.id === "POLICY.WEB.API.SINGLE_HTTP_CLIENT",
    );
    expect(entry).toBeDefined();
    const raw = readFileSync(join(REPO_CATALOG, entry?.path ?? ""), "utf8");
    expect(sha256OfUtf8(raw)).toBe(entry?.content_sha256);
  });
});
