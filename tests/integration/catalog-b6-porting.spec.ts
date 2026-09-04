/**
 * catalog-b6-porting.spec.ts —— B6 播种移植 catalog 面验收：
 * D5 精选 50 条 policies（B6b-I 25 + B6b-II 25）+ B6c 35 条（policy 面 25：22 required
 * + 3 advisory；TECHNOLOGY_PROFILE 分类面 10：9 STACK + 1 PROFILE）+
 * enforcement 轴工具级断言（R2 MUST 通胀缓解：SHOULD→advisory 由本 spec 机器守卫，
 * 不靠自觉；B6c 起 TP 面禁 required 同钉）。
 *
 * 钉面（prd.md R2/R3 / porting-design-proposal §1 矩阵 + R2 风险）：
 * - 分母钉：x-b6-porting 注记条目恰 85（D5 保守精选上限 25/批内执行——policy 强度面
 *   三批各 25；B6c 另有 TECHNOLOGY_PROFILE 登记面 10 条，非 policy 强度面不分食 D5
 *   上限且全量分母 < 上限）；
 * - enforcement 轴断言（B6b 定型的机器守卫，双向往返全钉，扩展到 B6c policy 分母）：
 *   source_sections 全 ∈ {SHOULD, Change Policy} → enforcement 必须 advisory（禁升
 *   required）；source_sections 含 MUST/MUST NOT → 必须 required_when_applicable
 *   （主锚定强度；强度只降不升）；**逆向规则**：source_sections 无 MUST/MUST NOT →
 *   禁 required（防工具 biconditional 未来变更漏拦）；
 * - B6c TECHNOLOGY_PROFILE 面（提案 §1 矩阵 TECHNOLOGY_OVERLAY 落位——不混入 policy
 *   强度面）：classification=TECHNOLOGY_PROFILE 全量；enforcement 禁 required_when_
 *   applicable（§92.5 激活输入非被激活规则本体）；source_sections 闭包 = overlay
 *   三段（Scope/Rules/Checklist）或 PROFILE yaml 行段词形；profile 卡 seeded_spec
 *   缺席（不播种——A1 档位机制零移植 + profile 分类落位 ADR）+ A1 双注记在册；
 * - 双面同源 pin（R1）：x-b6-porting.vendor_pin.sha256 == packages/cli/seeds/
 *   manifest.json 同文件 pin（catalog 条目面 ↔ 播种全文面同一 vendor 字节锚）；
 *   seeded_spec 锚与播种清单 target 一一对应（policy 面 .pomaster/specs/hard/backend/
 *   词形；TP STACK 面 .pomaster/specs/hard/stacks/<slug>/ 词形）；
 * - 物料形态：kind=policy + axes 词形 + applies_when.condition 在场（kernel
 *   loadCatalogPolicies fail-closed 词表闸实读全量生效；classification 双词形
 *   UNIVERSAL_POLICY / TECHNOLOGY_PROFILE 均在 CATALOG_CLASSIFICATION_VALUES 闭包）；
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
  classification_face?: string;
  enforcement_axis: { source_sections: string[]; rule: string; asserted_by: string };
  extra_master_sections?: string[];
  denominator: string;
  vendor_pin: { path: string; sha256: string; bytes: number };
  seeded_spec: string | null;
  seed_manifest: string;
  notes?: string[];
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
const B6_BATCHES = new Set(["B6B-1", "B6B-2", "B6C"]);

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

const policyFace = b6Entries.filter((e) => e.note.classification_face !== "technology_profile");
const tpFace = b6Entries.filter((e) => e.note.classification_face === "technology_profile");

describe("B6b/B6c catalog 双面：D5 精选分母 + 注记形态（三批合并）", () => {
  it("x-b6-porting 注记条目恰 85（B6b-I/B6b-II policy 面各 25 + B6c policy 面 25 + B6c TP 面 10）", () => {
    expect(b6Entries).toHaveLength(85);
    for (const batch of ["B6B-1", "B6B-2"]) {
      const inBatch = b6Entries.filter((e) => e.note.batch === batch);
      expect(inBatch, batch).toHaveLength(25);
      expect(inBatch.filter((e) => e.body.enforcement === "required_when_applicable")).toHaveLength(22);
      expect(inBatch.filter((e) => e.body.enforcement === "advisory")).toHaveLength(3);
    }
    // B6c：classification_face 双面划分——policy 面 25（22+3）+ TP 面 10。
    const b6c = b6Entries.filter((e) => e.note.batch === "B6C");
    expect(b6c).toHaveLength(35);
    expect(policyFace.filter((e) => e.note.batch === "B6C")).toHaveLength(25);
    expect(tpFace.filter((e) => e.note.batch === "B6C")).toHaveLength(10);
    const b6cPolicy = policyFace.filter((e) => e.note.batch === "B6C");
    expect(b6cPolicy.filter((e) => e.body.enforcement === "required_when_applicable")).toHaveLength(22);
    expect(b6cPolicy.filter((e) => e.body.enforcement === "advisory")).toHaveLength(3);
    const b6cRequired = b6Entries.filter(
      (e) => e.note.batch === "B6C" && e.body.enforcement === "required_when_applicable",
    );
    expect(b6cRequired).toHaveLength(22);
  });

  it("注记形态：batch ∈ 三批闭包 + denominator=vendor + human_review_required + vendor_pin hex64 + 断言器自指 + classification_face 词形", () => {
    for (const { note } of b6Entries) {
      expect(B6_BATCHES.has(note.batch), note.batch).toBe(true);
      expect(note.denominator).toBe("vendor");
      expect(note.human_review_required).toBe(true);
      expect(note.vendor_pin.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(note.vendor_pin.bytes).toBeGreaterThan(0);
      expect(
        note.vendor_pin.path.startsWith(
          "pomaster/components/frontend-hard-spec/assets/universal/",
        ) ||
          note.vendor_pin.path.startsWith(
            "pomaster/components/backend-hard-spec/assets/",
          ),
        note.vendor_pin.path,
      ).toBe(true);
      expect(note.enforcement_axis.asserted_by).toBe(
        "packages/cli/tests/catalog-b6-porting.spec.ts",
      );
      expect(note.enforcement_axis.source_sections.length).toBeGreaterThan(0);
      expect(note.seed_manifest).toBe("packages/cli/seeds/manifest.json");
      // classification_face（B6b 无字段=policy 面；B6c 双词形闭包）。
      expect(
        note.classification_face === undefined || note.classification_face === "policy"
          || note.classification_face === "technology_profile",
      ).toBe(true);
    }
  });

  it("物料形态：kind=policy + axes 四轴 + applies_when.condition 在场；classification 双词形与 face 对账（UNIVERSAL_POLICY=policy 面 / TECHNOLOGY_PROFILE=TP 面）", () => {
    for (const { body } of b6Entries) {
      expect(body.kind).toBe("policy");
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
    for (const { body } of policyFace) {
      expect(body.classification).toBe("UNIVERSAL_POLICY");
    }
    for (const { body } of tpFace) {
      // 提案 §1 矩阵：TECHNOLOGY_OVERLAY 走 TECHNOLOGY_PROFILE 分类，不混入 policy 强度面。
      expect(body.classification).toBe("TECHNOLOGY_PROFILE");
    }
  });
});

describe("enforcement 轴工具级断言（R2 MUST 通胀守卫——双向往返全钉；B6c policy 分母扩展）", () => {
  it("source_sections 全 ∈ {SHOULD, Change Policy} → enforcement 必须 advisory（SHOULD 源实物在册，断言非平凡）", () => {
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
    // policy 面九条 advisory（B6b 两批 3+3 + B6c 3）的 source_sections 确为纯建议段
    // （分母侧反向核对；TP 面 9 条 advisory 由 TECHNOLOGY_PROFILE describe 单独钉）。
    const advisoryPolicy = policyFace.filter((e) => e.body.enforcement === "advisory");
    expect(advisoryPolicy).toHaveLength(9);
    for (const { note } of advisoryPolicy) {
      for (const section of note.enforcement_axis.source_sections) {
        expect(ADVISORY_SECTIONS.has(section), `${note.seeded_spec} 段 ${section}`).toBe(true);
      }
    }
  });

  it("source_sections 含 MUST/MUST NOT → enforcement 必须 required_when_applicable（主锚定强度；禁静默降 knowledge/gate；B6c 分母含 22 条 MUST/MUST NOT 锚实物）", () => {
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

  it("逆向规则：source_sections 无 MUST/MUST NOT → 禁 required（biconditional 收口——纯建议段/锚证据不足的条目不得以 required 在册）", () => {
    for (const { body, note } of b6Entries) {
      const hasMust = note.enforcement_axis.source_sections.some(
        (s) => s === "MUST" || s === "MUST NOT",
      );
      if (!hasMust) {
        expect(
          body.enforcement,
          `${body.id}: ${note.enforcement_axis.source_sections.join("/")} 源无 MUST 锚禁 required`,
        ).not.toBe("required_when_applicable");
      }
    }
    // 分母侧反向核对：66 条 required 的 source_sections 全部含 MUST/MUST NOT 锚
    // （正逆两向合计 = 锚证据 ↔ 强度词形双射；工具侧池选取守卫未来漏拦即红）。
    const requiredEntries = b6Entries.filter(
      (e) => e.body.enforcement === "required_when_applicable",
    );
    expect(requiredEntries).toHaveLength(66);
    for (const { note } of requiredEntries) {
      expect(
        note.enforcement_axis.source_sections.some((s) => s === "MUST" || s === "MUST NOT"),
        `${note.seeded_spec} required 卡须有 MUST 锚`,
      ).toBe(true);
    }
  });

  it("policy 面 source_sections 词形闭包：只出现 12 段名（零私扩段词形）", () => {
    const allowed = new Set([
      "Scope", "Non-Scope", "Terms", "MUST", "MUST NOT", "SHOULD",
      "Contract", "Checklist", "Examples", "Anti-patterns", "Ownership", "Change Policy",
    ]);
    for (const { note } of policyFace) {
      for (const section of note.enforcement_axis.source_sections) {
        expect(allowed.has(section), `段词形 ${section}`).toBe(true);
      }
    }
  });
});

describe("B6c TECHNOLOGY_PROFILE 面（提案 §1 矩阵 TECHNOLOGY_OVERLAY 落位——不混入 policy 强度面）", () => {
  it("classification=TECHNOLOGY_PROFILE 恰 10 条（9 STACK + 1 PROFILE）；id 词形闭包", () => {
    expect(tpFace).toHaveLength(10);
    const stackCards = tpFace.filter((e) => e.body.id.startsWith("POLICY.STACK."));
    const profileCards = tpFace.filter((e) => e.body.id === "PROFILE.BASELINE.JAVA_ENTERPRISE_DEFAULT");
    expect(stackCards).toHaveLength(9);
    expect(profileCards).toHaveLength(1);
  });

  it("TP 面 enforcement 禁 required_when_applicable（§92.5 激活输入非被激活规则本体；强度只降不升——9 STACK 池判 required 降级 advisory + PROFILE 池判 deterministic_where_possible 原样）", () => {
    for (const { body } of tpFace) {
      expect(body.enforcement, `${body.id} TP 面禁 required`).not.toBe(
        "required_when_applicable",
      );
    }
    const advisories = tpFace.filter((e) => e.body.enforcement === "advisory");
    const deterministic = tpFace.filter(
      (e) => e.body.enforcement === "deterministic_where_possible",
    );
    expect(advisories).toHaveLength(9);
    expect(deterministic).toHaveLength(1);
  });

  it("TP 面 source_sections 闭包：STACK 卡 = overlay 三段（Scope/Rules/Checklist）；PROFILE 卡 = yaml 行段词形", () => {
    const overlaySections = new Set(["Scope", "Rules", "Checklist"]);
    for (const { body, note } of tpFace) {
      if (body.id === "PROFILE.BASELINE.JAVA_ENTERPRISE_DEFAULT") {
        expect(note.enforcement_axis.source_sections[0]).toContain("L1-13");
        continue;
      }
      for (const section of note.enforcement_axis.source_sections) {
        expect(overlaySections.has(section), `${body.id} 段词形 ${section}`).toBe(true);
      }
    }
  });

  it("profile 分类落位 ADR：profile 卡 seeded_spec 缺席（不播种）+ A1 双注记在册；STACK 卡 seeded_spec 落 stacks 播种面", () => {
    const profileCard = tpFace.find(
      (e) => e.body.id === "PROFILE.BASELINE.JAVA_ENTERPRISE_DEFAULT",
    )!;
    expect(profileCard.note.seeded_spec).toBeNull();
    expect(profileCard.note.notes?.some((n) => n.includes("A1 档位裁定登记"))).toBe(true);
    expect(profileCard.note.notes?.some((n) => n.includes("A1 清洗登记"))).toBe(true);
    for (const { note } of tpFace) {
      if (note.seeded_spec === null) continue;
      expect(note.seeded_spec.startsWith(".pomaster/specs/hard/stacks/")).toBe(true);
      expect(note.seeded_spec.endsWith("-overlay.md")).toBe(true);
    }
  });
});

describe("双面同源 pin（R1）：catalog 条目面 ↔ 播种全文面同一 vendor 字节锚", () => {
  it("x-b6-porting.vendor_pin == packages/cli/seeds/manifest.json 同文件 pin（85 条全量——B6b FE 面 + B6c BE/stacks 面）", () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, "packages", "cli", "seeds", "manifest.json"), "utf8"),
    ) as {
      entries: Array<{ target: string; source_path: string; source_sha256: string; source_bytes: number }>;
    };
    for (const { note, body } of b6Entries) {
      if (note.seeded_spec === null) continue; // profile 卡不播种（vendor_pin 仍可溯 vendor）。
      const entry = manifest.entries.find((e) => e.target === note.seeded_spec);
      expect(entry, `${body.id} seeded_spec 对应播种清单条目在册`).toBeDefined();
      expect(note.vendor_pin.sha256).toBe(entry!.source_sha256);
      expect(note.vendor_pin.bytes).toBe(entry!.source_bytes);
      expect(note.vendor_pin.path).toBe(entry!.source_path);
    }
  });

  it("seeded_spec 锚词形按面落位：B6b/B6c policy 面 specs/hard/backend 或 frontend；B6c TP STACK 面 specs/hard/stacks", () => {
    for (const { note } of b6Entries) {
      if (note.seeded_spec === null) continue;
      expect(
        note.seeded_spec.startsWith(".pomaster/specs/hard/backend/") ||
          note.seeded_spec.startsWith(".pomaster/specs/hard/frontend/") ||
          note.seeded_spec.startsWith(".pomaster/specs/hard/stacks/"),
        note.seeded_spec,
      ).toBe(true);
    }
    for (const { note } of policyFace) {
      if (note.batch !== "B6C") continue;
      expect(note.seeded_spec!.startsWith(".pomaster/specs/hard/backend/")).toBe(true);
    }
  });

  it("B6c policy 面 vendor_pin 源词形 == BE universal vendor 树（R1 播种分母钉）", () => {
    for (const { note } of policyFace) {
      if (note.batch !== "B6C") continue;
      expect(
        note.vendor_pin.path.startsWith(
          "pomaster/components/backend-hard-spec/assets/universal/",
        ),
        note.vendor_pin.path,
      ).toBe(true);
    }
  });
});

describe("kernel 装载面：全量 policies 词表闸实读生效（含 B6b/B6c 85 条）", () => {
  it("loadCatalogPolicies 全量装载成功（fail-closed 词表/必填校验零爆——词形闸经 kernel 单一生效；TECHNOLOGY_PROFILE classification 在词表闭包内实读通过）", () => {
    const materials = loadCatalogPolicies(CATALOG);
    expect(materials.length).toBeGreaterThanOrEqual(129);
    const byId = new Map(materials.map((m) => [m.id, m]));
    for (const { body } of b6Entries) {
      const material = byId.get(body.id);
      expect(material, `${body.id} 经 kernel 装载面在册`).toBeDefined();
      expect(material!.enforcement).toBe(body.enforcement);
    }
  });
});
