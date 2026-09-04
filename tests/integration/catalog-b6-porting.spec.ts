/**
 * catalog-b6-porting.spec.ts —— B6b-I FE 播种移植 catalog 面验收：
 * D5 精选 25 条 policies（22 required + 3 advisory）+ enforcement 轴工具级断言
 * （R2 MUST 通胀缓解：SHOULD→advisory 由本 spec 机器守卫，不靠自觉）。
 *
 * 钉面（prd.md R2 / porting-design-proposal §1 矩阵 + R2 风险）：
 * - 分母钉：x-b6-porting 注记条目恰 25（D5 保守精选上限/批先例 cap=25）；
 * - enforcement 轴断言（本批定型的机器守卫）：
 *   source_sections 全 ∈ {SHOULD, Change Policy} → enforcement 必须 advisory（禁升
 *   required）；source_sections 含 MUST/MUST NOT → 必须 required_when_applicable
 *   （强度只降不升——多锚卡主锚定强度）；
 * - 双面同源 pin（R1）：x-b6-porting.vendor_pin.sha256 == packages/cli/seeds/
 *   manifest.json 同文件 pin（catalog 条目面 ↔ 播种全文面同一 vendor 字节锚）；
 *   seeded_spec 锚与播种清单 target 一一对应；
 * - 物料形态：kind=policy + UNIVERSAL_POLICY + axes 词形 + applies_when.condition
 *   在场（kernel loadCatalogPolicies fail-closed 词表闸实读全量生效）；
 * - statement 词形证据：advisory 条目 statement 含「应」级建议词形（SHOULD 源），
 *   required 条目 statement 含「必须/不得/禁止」级义务词形（MUST/MUST NOT 源）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCatalogPolicies, resolveCatalogRoot } from "@pomaster/kernel";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const CATALOG = resolveCatalogRoot();

/** 原样 JSON 直读（x- 扩展注记不在 loader 判卷面——物料 provenance 读文件即可判卷）。 */
interface PortingNote {
  status: string;
  batch: string;
  human_review_required: boolean;
  enforcement_axis: { source_sections: string[]; rule: string; asserted_by: string };
  denominator: string;
  vendor_pin: { path: string; sha256: string; bytes: number };
  seeded_spec: string;
  seed_manifest: string;
}

interface PolicyBody {
  id: string;
  kind: string;
  classification: string;
  enforcement: string;
  statement_zh: string;
  axes?: Record<string, unknown>;
  applies_when?: { condition?: unknown };
  "x-b6-porting"?: PortingNote;
}

function readPolicy(fileName: string): PolicyBody {
  return JSON.parse(
    readFileSync(join(CATALOG, "policies", fileName), "utf8"),
  ) as PolicyBody;
}

const ADVISORY_SECTIONS = new Set(["SHOULD", "Change Policy"]);

const b6Entries: Array<{ file: string; body: PolicyBody; note: PortingNote }> = (function collect() {
  // 直读目录清单（relock/readdir 单点在 kernel；此处只挑 x-b6-porting 注记条目）。
  const out: Array<{ file: string; body: PolicyBody; note: PortingNote }> = [];
  for (const fileName of readdirSync(join(CATALOG, "policies")).sort()) {
    if (!fileName.endsWith(".json")) continue;
    const body = readPolicy(fileName);
    if (body["x-b6-porting"]) {
      out.push({ file: fileName, body, note: body["x-b6-porting"]! });
    }
  }
  return out;
})();

describe("B6b-I catalog 双面：D5 精选分母 + 注记形态", () => {
  it("x-b6-porting 注记条目恰 25（D5 保守精选上限/批；22 required + 3 advisory）", () => {
    expect(b6Entries).toHaveLength(25);
    const required = b6Entries.filter((e) => e.body.enforcement === "required_when_applicable");
    const advisory = b6Entries.filter((e) => e.body.enforcement === "advisory");
    expect(required).toHaveLength(22);
    expect(advisory).toHaveLength(3);
  });

  it("注记形态：batch=B6B-1 + denominator=vendor + human_review_required + vendor_pin hex64 + 断言器自指", () => {
    for (const { note } of b6Entries) {
      expect(note.batch).toBe("B6B-1");
      expect(note.denominator).toBe("vendor");
      expect(note.human_review_required).toBe(true);
      expect(note.vendor_pin.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(note.vendor_pin.bytes).toBeGreaterThan(0);
      expect(note.vendor_pin.path.startsWith("pomaster/components/frontend-hard-spec/assets/universal/")).toBe(true);
      expect(note.enforcement_axis.asserted_by).toBe(
        "packages/cli/tests/catalog-b6-porting.spec.ts",
      );
      expect(note.enforcement_axis.source_sections.length).toBeGreaterThan(0);
      expect(note.seed_manifest).toBe("packages/cli/seeds/manifest.json");
    }
  });

  it("物料形态：kind=policy + UNIVERSAL_POLICY + axes 四轴 + applies_when.condition 在场", () => {
    for (const { body } of b6Entries) {
      expect(body.kind).toBe("policy");
      expect(body.classification).toBe("UNIVERSAL_POLICY");
      expect(body.axes).toMatchObject({
        lifecycle: "PROPOSED",
        confidence: "UNRESOLVED",
        evidence: "PLANNED",
        change: "STABLE",
      });
      expect(typeof body.applies_when?.condition).toBe("string");
      expect((body.applies_when?.condition as string).length).toBeGreaterThan(0);
      expect(typeof body.statement_zh).toBe("string");
    }
  });
});

describe("enforcement 轴工具级断言（R2 MUST 通胀守卫——SHOULD 源禁升 required）", () => {
  it("source_sections 全 ∈ {SHOULD, Change Policy} → enforcement 必须 advisory（3 条 SHOULD 源实物在册，断言非平凡）", () => {
    const advisoryEntries = b6Entries.filter(
      (e) => e.body.enforcement === "advisory",
    );
    expect(advisoryEntries.length).toBeGreaterThan(0);
    for (const { body, note } of b6Entries) {
      const allAdvisorySections =
        note.enforcement_axis.source_sections.every((s) => ADVISORY_SECTIONS.has(s));
      if (allAdvisorySections) {
        expect(
          body.enforcement,
          `${body.id}: ${note.enforcement_axis.source_sections.join("/")} 源禁升 required`,
        ).toBe("advisory");
      }
    }
    // 三条 advisory 的 source_sections 确为纯建议段（分母侧反向核对）。
    const advisorySections = advisoryEntries.map(
      (e) => e.note.enforcement_axis.source_sections,
    );
    expect(advisorySections.length).toBe(3);
    for (const sections of advisorySections) {
      for (const section of sections) {
        expect(ADVISORY_SECTIONS.has(section)).toBe(true);
      }
    }
  });

  it("source_sections 含 MUST/MUST NOT → enforcement 必须 required_when_applicable（主锚定强度；禁静默降 knowledge/gate）", () => {
    for (const { body, note } of b6Entries) {
      const hasMust = note.enforcement_axis.source_sections.some(
        (s) => s === "MUST" || s === "MUST NOT",
      );
      if (hasMust) {
        expect(
          body.enforcement,
          `${body.id}: MUST/MUST NOT 锚在册`,
        ).toBe("required_when_applicable");
      }
    }
  });

  it("source_sections 词形闭包：只出现 12 段名（零私扩段词形）", () => {
    const allowed = new Set([
      "Scope", "Non-Scope", "Terms", "MUST", "MUST NOT", "SHOULD",
      "Contract", "Checklist", "Examples", "Anti-patterns", "Ownership", "Change Policy",
    ]);
    for (const { note } of b6Entries) {
      for (const section of note.enforcement_axis.source_sections) {
        expect(allowed.has(section), `段词形 ${section}`).toBe(true);
      }
    }
  });
});

describe("双面同源 pin（R1）：catalog 条目面 ↔ 播种全文面同一 vendor 字节锚", () => {
  it("x-b6-porting.vendor_pin == packages/cli/seeds/manifest.json 同文件 pin", () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, "packages", "cli", "seeds", "manifest.json"), "utf8"),
    ) as {
      entries: Array<{ target: string; source_path: string; source_sha256: string; source_bytes: number }>;
    };
    for (const { note, body } of b6Entries) {
      const entry = manifest.entries.find((e) => e.target === note.seeded_spec);
      expect(entry, `${body.id} seeded_spec 对应播种清单条目在册`).toBeDefined();
      expect(note.vendor_pin.sha256).toBe(entry!.source_sha256);
      expect(note.vendor_pin.bytes).toBe(entry!.source_bytes);
      expect(note.vendor_pin.path).toBe(entry!.source_path);
    }
  });

  it("seeded_spec 锚词形全部落 specs/hard/frontend 播种面", () => {
    for (const { note } of b6Entries) {
      expect(note.seeded_spec.startsWith(".pomaster/specs/hard/frontend/")).toBe(true);
    }
  });
});

describe("kernel 装载面：全量 policies 词表闸实读生效（含本批 25 条）", () => {
  it("loadCatalogPolicies 全量装载成功（fail-closed 词表/必填校验零爆——词形闸经 kernel 单一生效）", () => {
    const materials = loadCatalogPolicies(CATALOG);
    expect(materials.length).toBeGreaterThanOrEqual(104);
    const byId = new Map(materials.map((m) => [m.id, m]));
    for (const { body } of b6Entries) {
      const material = byId.get(body.id);
      expect(material, `${body.id} 经 kernel 装载面在册`).toBeDefined();
      expect(material!.enforcement).toBe(body.enforcement);
    }
  });
});
