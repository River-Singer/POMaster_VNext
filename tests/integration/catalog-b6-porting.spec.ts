/**
 * catalog-b6-porting.spec.ts —— B6 播种移植 catalog 面验收：
 * D5 精选 50 条 policies（B6b-I 25 + B6b-II 25）+ B6c 35 条（policy 面 25：22 required
 * + 3 advisory；TECHNOLOGY_PROFILE 分类面 10：9 STACK + 1 PROFILE）+ D3 复核批 42 条
 * （D3-R1 25：required 9 补锚 + advisory 16；D3-R2 17：advisory 全量——裁定批 G 收尾轮）+
 * enforcement 轴工具级断言（R2 MUST 通胀缓解：SHOULD→advisory 由本 spec 机器守卫，
 * 不靠自觉；B6c 起 TP 面禁 required 同钉）。
 *
 * 钉面（prd.md R2/R3 / porting-design-proposal §1 矩阵 + R2 风险 + 裁决 13/14 D3 复核）：
 * - 分母钉：x-b6-porting 注记条目恰 127（D5 保守精选上限 25/批内执行——policy 强度面
 *   三批各 25；B6c 另有 TECHNOLOGY_PROFILE 登记面 10 条 = **Owner 追认例外**——
 *   裁决 12①/D6=(b)：TP 面计入 D5 上限，B6c 已落 10 条维持现状不改写；D3 复核两轮
 *   = D6 合并口径守卫批（R1 恰等 25；R2 = 17 ≤ 25）；
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
const B6_BATCHES = new Set(["B6B-1", "B6B-2", "B6C", "D3-R1", "D3-R2"]);
// D3 复核批扩展段锚白名单（MASTer 项目扩展段词形——12 段闭包外锚行含行为规范成分，
// D3 逐卡复核裁定 advisory 入册；extra_master_sections 同值如实登记）。
const D3_EXTRA_SECTION_WHITELIST = new Set([
  "本地 ESLint 规则与 Registry 校验", // D3-R1：FE10 扩展段
  "冲突与责任边界", // D3-R2：BE index 自有段（冲突优先序）
  "通用规则准入与维护来源", // D3-R2：FE index 自有段（一手来源）
  "Spec 生命周期", // D3-R2：FE index 自有段（冻结时点）
]);

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

describe("B6b/B6c catalog 双面：D5 精选分母 + 注记形态（五批合并，含 D3-R1/R2 复核批）", () => {
  it("x-b6-porting 注记条目恰 127（B6b-I/B6b-II policy 面各 25 + B6c policy 面 25 + B6c TP 面 10 + D3-R1 25 + D3-R2 17）", () => {
    expect(b6Entries).toHaveLength(127);
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
    // D3-R1 复核批：required 9（D3b 补锚 MUST/MUST NOT）+ advisory 16（Change Policy
    // 降 advisory 14 + 密度序 2）= 25（D6 合并上限恰等）。
    const d3 = b6Entries.filter((e) => e.note.batch === "D3-R1");
    expect(d3).toHaveLength(25);
    expect(d3.filter((e) => e.body.enforcement === "required_when_applicable")).toHaveLength(9);
    expect(d3.filter((e) => e.body.enforcement === "advisory")).toHaveLength(16);
    // D3-R2 收尾轮（裁定批 G）：advisory 全量 17（required 已在 R1 全量入册）。
    const d3r2 = b6Entries.filter((e) => e.note.batch === "D3-R2");
    expect(d3r2).toHaveLength(17);
    expect(d3r2.filter((e) => e.body.enforcement === "advisory")).toHaveLength(17);
    expect(d3r2.filter((e) => e.body.enforcement === "required_when_applicable")).toHaveLength(0);
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
    // （分母侧反向核对；TP 面 9 条 advisory 由 TECHNOLOGY_PROFILE describe 单独钉；
    // D3 复核两轮 16+17 条 advisory 另测——扩展段锚白名单除外）。
    const advisoryPolicyB6 = policyFace.filter(
      (e) => e.body.enforcement === "advisory" && B6_BATCHES.has(e.note.batch)
        && e.note.batch !== "D3-R1" && e.note.batch !== "D3-R2",
    );
    expect(advisoryPolicyB6).toHaveLength(9);
    for (const { note } of advisoryPolicyB6) {
      for (const section of note.enforcement_axis.source_sections) {
        expect(ADVISORY_SECTIONS.has(section), `${note.seeded_spec} 段 ${section}`).toBe(true);
      }
    }
    // D3-R1 批 advisory 16：15 条建议段 + REGISTRY 扩展段锚（白名单唯一例外，双注记）。
    const d3Advisory = policyFace.filter(
      (e) => e.body.enforcement === "advisory" && e.note.batch === "D3-R1",
    );
    expect(d3Advisory).toHaveLength(16);
    const d3Extra = d3Advisory.filter(
      (e) => !e.note.enforcement_axis.source_sections.every((s) => ADVISORY_SECTIONS.has(s)),
    );
    expect(d3Extra).toHaveLength(1);
    expect(d3Extra[0].body.id).toBe("POLICY.REGISTRY.HUMAN_FIELDS_VALIDATED_DECORRELATED");
    for (const section of d3Extra[0].note.enforcement_axis.source_sections) {
      expect(D3_EXTRA_SECTION_WHITELIST.has(section)).toBe(true);
    }
    expect(d3Extra[0].note.extra_master_sections).toEqual(
      d3Extra[0].note.enforcement_axis.source_sections,
    );
    // D3-R2 批 advisory 17：13 条 SHOULD 建议 + 扩展段锚 3（BE index 冲突序 + FE index
    // 双段——白名单例外，双注记）；零 required（强度只降不升——池判 required 卡降档）。
    const d3r2Advisory = policyFace.filter(
      (e) => e.body.enforcement === "advisory" && e.note.batch === "D3-R2",
    );
    expect(d3r2Advisory).toHaveLength(17);
    const d3r2Extra = d3r2Advisory.filter(
      (e) => !e.note.enforcement_axis.source_sections.every((s) => ADVISORY_SECTIONS.has(s)),
    );
    expect(d3r2Extra).toHaveLength(3);
    expect(new Set(d3r2Extra.map((e) => e.body.id))).toEqual(
      new Set([
        "POLICY.SPEC.PRIMARY_SOURCE_BASIS",
        "POLICY.SPEC.FREEZE_BEFORE_USE",
        "POLICY.SPEC.FAMILY_CONFLICT_PRECEDENCE",
      ]),
    );
    for (const { note } of d3r2Extra) {
      expect(note.extra_master_sections).toEqual(note.enforcement_axis.source_sections);
      for (const section of note.enforcement_axis.source_sections) {
        expect(D3_EXTRA_SECTION_WHITELIST.has(section), `D3-R2 段词形 ${section}`).toBe(true);
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
    // 分母侧反向核对：75 条 required 的 source_sections 全部含 MUST/MUST NOT 锚
    // （B6 三批 66 + D3-R1 补锚 9；正逆两向合计 = 锚证据 ↔ 强度词形双射；工具侧池
    // 选取守卫未来漏拦即红）。
    const requiredEntries = b6Entries.filter(
      (e) => e.body.enforcement === "required_when_applicable",
    );
    expect(requiredEntries).toHaveLength(75);
    for (const { note } of requiredEntries) {
      expect(
        note.enforcement_axis.source_sections.some((s) => s === "MUST" || s === "MUST NOT"),
        `${note.seeded_spec} required 卡须有 MUST 锚`,
      ).toBe(true);
    }
  });

  it("policy 面 source_sections 词形闭包：B6 三批只出现 12 段名（零私扩段词形）；D3 两轮 12 段 + 复核扩展段白名单", () => {
    const allowed = new Set([
      "Scope", "Non-Scope", "Terms", "MUST", "MUST NOT", "SHOULD",
      "Contract", "Checklist", "Examples", "Anti-patterns", "Ownership", "Change Policy",
    ]);
    for (const { note } of policyFace) {
      if (note.batch === "D3-R1" || note.batch === "D3-R2") continue;
      for (const section of note.enforcement_axis.source_sections) {
        expect(allowed.has(section), `段词形 ${section}`).toBe(true);
      }
    }
    for (const { note } of policyFace) {
      if (note.batch !== "D3-R1" && note.batch !== "D3-R2") continue;
      for (const section of note.enforcement_axis.source_sections) {
        expect(
          allowed.has(section) || D3_EXTRA_SECTION_WHITELIST.has(section),
          `D3 段词形 ${section}`,
        ).toBe(true);
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
  it("x-b6-porting.vendor_pin == packages/cli/seeds/manifest.json 同文件 pin（127 条全量——B6b FE 面 + B6c BE/stacks 面 + D3 两轮复核批 FE/BE 面）", () => {
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

describe("D6 TP 口径（Owner 裁决 12①，2026-09-05）：TECHNOLOGY_PROFILE 面计入 D5 上限", () => {
  const D5_CAP_PER_BATCH = 25;
  const GRANDFATHERED_BATCHES = new Set(["B6B-1", "B6B-2", "B6C"]);

  it("B6c 追认例外恰等：批内 policy 面 25（= D5 上限）+ TP 面 10（追认例外）= 35，零第三形态", () => {
    const b6c = b6Entries.filter((e) => e.note.batch === "B6C");
    expect(policyFace.filter((e) => e.note.batch === "B6C")).toHaveLength(25);
    expect(tpFace.filter((e) => e.note.batch === "B6C")).toHaveLength(10);
    expect(b6c).toHaveLength(D5_CAP_PER_BATCH + 10);
    // 追认例外面形态核对：TP 面禁 required（§92.5 激活输入非规则本体——既有钉复述）。
    for (const { body } of tpFace) {
      expect(body.enforcement).not.toBe("required_when_applicable");
    }
  });

  it("未来批合并上限守卫（D6=(b) 不再豁免）：任何新批 x-b6-porting 条目 policy+TP 合计 ≤ 25/批（D3-R1 恰等 25；D3-R2 收尾轮 17 在限内）；未知新批入选必须先过本守卫并更新分母名单（漏改即红）", () => {
    const futureBatches = new Set(
      b6Entries.map((e) => e.note.batch).filter((b) => !GRANDFATHERED_BATCHES.has(b)),
    );
    for (const batch of futureBatches) {
      const inBatch = b6Entries.filter((e) => e.note.batch === batch);
      expect(
        inBatch.length,
        `${batch}: D6 口径 policy+TP 合并上限 ${D5_CAP_PER_BATCH}/批（裁决 12①——TP 面不再豁免）`,
      ).toBeLessThanOrEqual(D5_CAP_PER_BATCH);
    }
    // 当前分母恰 = 三个追认批 + D3 两轮守卫批（R1 恰等上限、R2 = 17 在限内；未知批落地
    // 时本断言先红，强制显式接受 ≤25 合并判卷——禁静默扩池）。
    expect(
      b6Entries.every(
        (e) => GRANDFATHERED_BATCHES.has(e.note.batch) || e.note.batch === "D3-R1"
          || e.note.batch === "D3-R2",
      ),
    ).toBe(true);
  });
});

describe("D3 逐卡复核批（Owner 2026-09-05 裁定 D3=逐卡复核；裁定批 F=D3-R1 + 裁定批 G=D3-R2 两轮落地）", () => {
  const D3_REGISTERED_IDS = [
    // required 9（D3b source=null 补锚 MUST/MUST NOT）
    "POLICY.SEC.TRUST_BOUNDARY_ENFORCEMENT",
    "POLICY.SEC.NO_CLIENT_SIDE_TRUST",
    "POLICY.CFG.CONFIG_ATTRIBUTE_COMPLETENESS",
    "POLICY.CFG.NO_SECRET_DISPERSAL",
    "POLICY.AUTHZ.SERVER_FIVE_FACTOR_VERIFICATION",
    "POLICY.AUTHZ.NO_GATING_PROXY_TRUST",
    "POLICY.PRV.SENSITIVE_DATA_SIX_FACTS",
    "POLICY.ERR.FAILURE_FIVE_PART_MAPPING",
    "POLICY.ERR.NO_INTERNAL_DETAIL_EXPOSURE",
    // advisory 14（Change Policy 锚降 advisory）
    "POLICY.OBS.SIGNAL_CHANGE_IMPACT",
    "POLICY.PERF.BUDGET_CHANGE_RETEST",
    "POLICY.CACHE.SCHEMA_VERSIONING",
    "POLICY.ARCH.ADR_IMMUTABLE_HISTORY",
    "POLICY.TOOL.UPGRADE_VERIFY_LOCK_ROLLBACK",
    "POLICY.EVID.NO_SILENT_GATE_REMOVAL",
    "POLICY.REL.PROCESS_CHANGE_NEEDS_DRILL_AUDIT",
    "POLICY.DEP.TIME_BOXED_URGENT_EXCEPTION",
    "POLICY.TEST.REMOVAL_NEEDS_SUBSTITUTE_EVIDENCE",
    "POLICY.PRV.PROCESSING_SCOPE_RE_REVIEW",
    "POLICY.AUTHZ.PERMISSION_SCOPE_EXPANSION_GATE",
    "POLICY.SEC.SECURITY_RELAXATION_GATE",
    "POLICY.CFG.KEY_RENAME_DUAL_READ",
    "POLICY.ERR.PUBLISHED_CODE_IMMUTABLE",
    // advisory 2（池密度序补位）
    "POLICY.REGISTRY.HUMAN_FIELDS_VALIDATED_DECORRELATED",
    "POLICY.SEC.RELAXATION_APPROVAL",
  ];
  const D3_EXCLUDED_KEEP_IDS = [
    "AUTHORITY.WEB.COMP.OWNERS", "AUTHORITY.WEB.PAGE.OWNERS",
    "AUTHORITY.WEB.STYLE.OWNERS", "AUTHORITY.WEB.I18N.OWNERS",
    "AUTHORITY.WEB.COPY.OWNERS", "AUTHORITY.WEB.TRACK.OWNERS",
    "AUTHORITY.WEB.HANDOFF.OWNERS",
    "AUTHORITY.ARCH.DECISION_OWNERS", "AUTHORITY.STRUCT.MODULE_OWNERS",
    "AUTHORITY.BOUND.ENTRY_CHANGE_APPROVAL", "AUTHORITY.LAYER.LAYERING_OWNERS",
    "AUTHORITY.WF.EXECUTION_REVIEW_SPLIT", "AUTHORITY.AI.AGENT_USER_DECISION_BOUNDARY",
    "AUTHORITY.EVID.IMPLEMENTER_PROVIDER_REVIEWER_JUDGE",
    "AUTHORITY.ROLE.MODEL_VS_PROJECT_BINDING", "AUTHORITY.TOOL.TOOLCHAIN_OWNERS",
    "AUTHORITY.DEP.ADMISSION_AND_BLOCK_OWNERS", "AUTHORITY.TEST.CHANGE_TEST_OWNERS",
    "AUTHORITY.REL.RELEASE_GATE_OWNERS", "AUTHORITY.SEC.SECURITY_OWNERSHIP",
    "AUTHORITY.CFG.CONFIG_OWNERSHIP", "AUTHORITY.PRV.DATA_OWNERSHIP",
    "AUTHORITY.ERR.ERROR_REGISTRY_OWNERSHIP",
    "AUTHORITY.AUTHZ.PERMISSION_SEMANTICS_OWNERSHIP",
    "AUTHORITY.BE.CACHE_OWNERSHIP", "AUTHORITY.BE.INTEGRATION_OWNERSHIP",
    "AUTHORITY.BE.JOB_OWNERSHIP", "AUTHORITY.BE.OBS_OWNERSHIP",
    "AUTHORITY.BE.PERF_OWNERSHIP", "AUTHORITY.BE.DEPLOY_OWNERSHIP",
  ];
  // D3-R2 轮（裁定批 G）：原留账 17 张全部转在册（裁决 13 密度序双锚留账 → 裁决 14
  // 同口径入册；id 名单与 seed_d3_review.py D3_R2_REGISTERED 恰等）。
  const D3_R2_REGISTERED_IDS = [
    "POLICY.TEST.REMOVAL_JUSTIFICATION", "POLICY.SPEC.PRIMARY_SOURCE_BASIS",
    "POLICY.SPEC.FAMILY_CONFLICT_PRECEDENCE", "POLICY.CACHE.FAILURE_MODE_GUARDS",
    "POLICY.DEPLOY.OPERATIONAL_CAPABILITIES", "POLICY.INTEGRATION.FAULT_CONTAINMENT",
    "POLICY.JOB.OPERATIONAL_FEATURES", "POLICY.OBS.ACTIONABLE_SIGNALS",
    "POLICY.PERF.OBSERVATION_DIMENSIONS", "POLICY.SPEC.FREEZE_BEFORE_USE",
    "POLICY.BE.CONC.PREFER_DB_CONSTRAINTS", "POLICY.BE.DB.EXPAND_MIGRATE_CONTRACT",
    "POLICY.BE.IDEM.KEY_PAYLOAD_CONFLICT", "POLICY.BE.MODEL.SINGLE_BOUNDARY_CONVERSION",
    "POLICY.BE.SQL.INDEX_FOR_KNOWN_QUERIES", "POLICY.BE.STATE.SINGLE_RULE_SOURCE",
    "POLICY.BE.TXN.SHORT_LOCKS_COMPENSATION",
  ];

  it("D3 总账恰等 72 = R1 入册 25 + R2 入册 17 + 维持排除 30；三集两两不交", () => {
    expect(D3_REGISTERED_IDS).toHaveLength(25);
    expect(D3_R2_REGISTERED_IDS).toHaveLength(17);
    expect(D3_EXCLUDED_KEEP_IDS).toHaveLength(30);
    const sets = [new Set(D3_REGISTERED_IDS), new Set(D3_EXCLUDED_KEEP_IDS), new Set(D3_R2_REGISTERED_IDS)];
    const union = new Set([...sets[0], ...sets[1], ...sets[2]]);
    expect(union.size).toBe(72);
  });

  it("D3-R1 入册名单恰等（逐 id 在册 + enforcement 轴：MUST 锚 9 条 required / 其余 16 条 advisory）", () => {
    const d3 = b6Entries.filter((e) => e.note.batch === "D3-R1");
    expect(new Set(d3.map((e) => e.body.id))).toEqual(new Set(D3_REGISTERED_IDS));
    for (const { body, note } of d3) {
      const hasMust = note.enforcement_axis.source_sections.some(
        (s) => s === "MUST" || s === "MUST NOT",
      );
      expect(body.enforcement).toBe(
        hasMust ? "required_when_applicable" : "advisory",
      );
    }
  });

  it("D3-R2 入册名单恰等（裁决 13 留账 → 裁决 14 转在册：逐 id batch=D3-R2 + advisory 全量 + d3_review 注记在座）", () => {
    const d3r2 = b6Entries.filter((e) => e.note.batch === "D3-R2");
    expect(new Set(d3r2.map((e) => e.body.id))).toEqual(new Set(D3_R2_REGISTERED_IDS));
    for (const { body, note } of d3r2) {
      // 全量 advisory（强度只降不升——R2 无 MUST 锚、零 required）。
      expect(
        note.enforcement_axis.source_sections.some((s) => s === "MUST" || s === "MUST NOT"),
        `${body.id} R2 无 MUST 锚`,
      ).toBe(false);
      expect(body.enforcement).toBe("advisory");
      const review = (note as unknown as {
        d3_review?: { excluded_from_batch: string; anchor_evidence: string };
      }).d3_review;
      expect(review, body.id).toBeDefined();
      expect(review!.anchor_evidence).toContain("MASTer ");
    }
    // 13 条 SHOULD 锚（B6c BE-G4 六 + BE-G3 七）+ 4 条 Change Policy/扩展段锚
    // （后三者已由扩展段白名单 describe 钉——此处钉 SHOULD 分母恰 13）。
    const shouldAnchored = d3r2.filter((e) =>
      e.note.enforcement_axis.source_sections.every((s) => ADVISORY_SECTIONS.has(s))
      && e.note.enforcement_axis.source_sections.includes("SHOULD"),
    );
    expect(shouldAnchored).toHaveLength(13);
  });

  it("d3_review 复核注记形态：原排除批 ∈ {B6B-1, B6B-2, B6C} + 排除理由词形 + 锚行证据在座（禁凭印象）+ 轮次词形分立（R1=裁定批 F / R2=裁定批 G）", () => {
    const d3 = b6Entries.filter(
      (e) => e.note.batch === "D3-R1" || e.note.batch === "D3-R2",
    );
    for (const { note } of d3) {
      const review = (note as unknown as {
        d3_review?: {
          excluded_from_batch: string;
          exclusion_reason_at_seed: string;
          adjudication: string;
          anchor_evidence: string;
          pool_enforcement_at_seed: string;
        };
      }).d3_review;
      expect(review, note.seeded_spec ?? undefined).toBeDefined();
      expect(["B6B-1", "B6B-2", "B6C"]).toContain(review!.excluded_from_batch);
      expect(review!.exclusion_reason_at_seed).toContain("保守排除待复核");
      expect(review!.adjudication).toContain("D3 逐卡复核");
      expect(review!.anchor_evidence).toContain("MASTer ");
      expect(review!.pool_enforcement_at_seed).toBeDefined();
      if (note.batch === "D3-R1") {
        expect(review!.adjudication).toContain("裁定批 F");
        expect(review!.adjudication).not.toContain("R2 轮");
      } else {
        expect(review!.adjudication).toContain("R2 轮");
        expect(review!.adjudication).toContain("裁定批 G");
      }
    }
  });

  it("x-vocab-pr 注记两态恰等：R1 新域段 8 条（AUTHZ/PRV/ERR）随 PR-0010 转正（resolution 在座，历史 finding/proposal 原样保留）；R2 新域段 7 条（BE）候选注记在册待词汇表 PR", () => {
    // R1 面：恰 8 条带注记且全部已转正（resolution 含 PR-0010 词形）——裸 pending 零残留。
    const d3r1 = b6Entries.filter((e) => e.note.batch === "D3-R1");
    const r1Resolved = d3r1.filter((e) => "x-vocab-pr" in e.body);
    expect(r1Resolved.map((e) => e.body.id).sort()).toEqual(
      [
        "POLICY.AUTHZ.NO_GATING_PROXY_TRUST",
        "POLICY.AUTHZ.PERMISSION_SCOPE_EXPANSION_GATE",
        "POLICY.AUTHZ.SERVER_FIVE_FACTOR_VERIFICATION",
        "POLICY.ERR.FAILURE_FIVE_PART_MAPPING",
        "POLICY.ERR.NO_INTERNAL_DETAIL_EXPOSURE",
        "POLICY.ERR.PUBLISHED_CODE_IMMUTABLE",
        "POLICY.PRV.PROCESSING_SCOPE_RE_REVIEW",
        "POLICY.PRV.SENSITIVE_DATA_SIX_FACTS",
      ],
    );
    for (const { body } of r1Resolved) {
      const vocab = (body as unknown as Record<string, {
        status?: string; locked_vocab_untouched?: boolean; resolution?: string;
      }>)["x-vocab-pr"];
      expect(vocab!.status).toBe("vocab_pr_candidate");
      expect(vocab!.locked_vocab_untouched).toBe(true);
      expect(vocab!.resolution).toContain("PR-0010");
      expect(vocab!.resolution).toContain("vocab-lock@v0.9-resolved");
    }
    // R2 面：恰 7 条 BE 域段候选注记（无 resolution——待下一个词汇表 PR）。
    const d3r2 = b6Entries.filter((e) => e.note.batch === "D3-R2");
    const r2Pending = d3r2.filter((e) => "x-vocab-pr" in e.body);
    expect(r2Pending.map((e) => e.body.id).sort()).toEqual(
      [
        "POLICY.BE.CONC.PREFER_DB_CONSTRAINTS",
        "POLICY.BE.DB.EXPAND_MIGRATE_CONTRACT",
        "POLICY.BE.IDEM.KEY_PAYLOAD_CONFLICT",
        "POLICY.BE.MODEL.SINGLE_BOUNDARY_CONVERSION",
        "POLICY.BE.SQL.INDEX_FOR_KNOWN_QUERIES",
        "POLICY.BE.STATE.SINGLE_RULE_SOURCE",
        "POLICY.BE.TXN.SHORT_LOCKS_COMPENSATION",
      ],
    );
    for (const { body } of r2Pending) {
      const vocab = (body as unknown as Record<string, {
        status?: string; locked_vocab_untouched?: boolean; resolution?: string;
      }>)["x-vocab-pr"];
      expect(vocab!.status).toBe("vocab_pr_candidate");
      expect(vocab!.locked_vocab_untouched).toBe(true);
      expect(vocab!.resolution).toBeUndefined();
    }
    // 两轮其余条目零注记。
    const withNote = d3r1.filter((e) => "x-vocab-pr" in e.body).length
      + d3r2.filter((e) => "x-vocab-pr" in e.body).length;
    expect(withNote).toBe(15);
  });

  it("维持排除 30 张（Ownership 归属说明族）不在册（catalog/policies 零文件）；D3 两轮 42 张全量在册", () => {
    const presentIds = new Set(b6Entries.map((e) => e.body.id));
    for (const id of D3_EXCLUDED_KEEP_IDS) {
      expect(presentIds.has(id), `${id} 应维持留池不在册`).toBe(false);
    }
    for (const id of [...D3_REGISTERED_IDS, ...D3_R2_REGISTERED_IDS]) {
      expect(presentIds.has(id), `${id} 应在册`).toBe(true);
    }
  });
});

describe("kernel 装载面：全量 policies 词表闸实读生效（含 B6/B6b/B6c/D3 两轮 127 条）", () => {
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
