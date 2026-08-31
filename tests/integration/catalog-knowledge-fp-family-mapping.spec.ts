/**
 * catalog-knowledge-fp-family-mapping.spec.ts —— P29 CV-6 对账钉死（tests/integration，L2 账）。
 *
 * 对账对象：B3 口径「最小 MUST 集 + 五大家族 failure-pattern 附带」（docs/wave3-research-toolchain.md
 * §3 CV-6 行）与 catalog/knowledge/ 现存 5 条 knowledge.fp.* 物料的映射关系。
 *
 * 对账结论（2026-08-31 实测，呈报载体 docs/catalog-b3-five-family-reconciliation-cv6.md）：
 *   - 五大家族词形逐字锚 = packages/schemas/assets/golden-seed-mapping.md §ev01
 *     （masters-evidence-01-claude-memory.md 11 类病灶的前五类）；
 *   - 现存 5 条 fp 全部「不映射到五家族、属独立案例」（契约漂移 ×2 / 请求层架构 ×1 /
 *     共享默认值波及 ×2）；
 *   - 五家族在 catalog knowledge 物料层 0/5 覆盖（缺口处置 = CLI knowledge record 演示通道
 *     CANDIDATE 登记；物料面补缺挂 CV-8 后，lifecycle 未裁前不动）。
 *
 * 本文件钉死上述对账表：catalog/knowledge/ 的 fp 物料被改名/删除/新增、或五家族词形漂移时，
 * 此处显式红——对账结论不允许被物料侧静默变更破坏。物料面自身何时扩（五家族补缺）挂 Owner
 * 裁决链（CV-8），不在本测试的放行范围内：新增 fp 条目必须伴随本映射表的显式修订。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCatalogRoot } from "@pomaster/kernel";

/** fp 物料目录（catalog 管辖面 knowledge/）。 */
const KNOWLEDGE_DIR = join(resolveCatalogRoot(), "knowledge");

/** 五大家族词形（ev01 逐字类名；CV-6 对账的家族分母，禁改写）。 */
const FIVE_FAMILIES = [
  "clobber 家族（批次化破坏性重写）",
  "检查器双标（byte-equality 两个官方检查器矛盾判定）",
  "授权状态机被标准操作倒退",
  "门禁硬编码业务分母（分母漂移）",
  "扫描器静默盲区假绿",
] as const;

/**
 * CV-6 对账表（家族映射轴）：id → 五家族（null = 不映射、属独立案例）+ 独立案例组。
 * 新增 fp 条目或家族覆盖变化时必须显式修订本表（不可静默）。
 */
const FP_FAMILY_MAPPING: Readonly<
  Record<string, { readonly family: string | null; readonly group: string }>
> = {
  "KNOWLEDGE.FP.API.FIELD_DRIFT_NO_CONTRACT": {
    family: null,
    group: "契约漂移（改字段不更新契约与调用方兼容测试）",
  },
  "KNOWLEDGE.FP.API.PER_PAGE_HTTP_CLIENT": {
    family: null,
    group: "请求层架构反模式（每页自建请求实例/各自刷 token/字符串比错）",
  },
  "KNOWLEDGE.FP.BE.CONTRACT_DRIFT": {
    family: null,
    group: "契约漂移（只改实现不同步 OpenAPI/migration/事件 schema）",
  },
  "KNOWLEDGE.FP.CHG.PAGE_LOCAL_PADDING": {
    family: null,
    group: "共享默认值局部改 → 全站波及（无视觉回归兜底）",
  },
  "KNOWLEDGE.FP.GRID.GLOBAL_TD_WIDTH": {
    family: null,
    group: "共享默认值局部改 → 全站波及（全局 td 宽度 CSS）",
  },
};

interface KnowledgeMaterial {
  id: string;
  kind: string;
  classification?: string;
  axes?: { lifecycle?: string; evidence?: string };
  enforcement?: string;
  review_notes?: string[];
}

function loadFpMaterials(): KnowledgeMaterial[] {
  const files = readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.startsWith("knowledge.fp.") && f.endsWith(".json"))
    .sort();
  return files.map((f) =>
    JSON.parse(readFileSync(join(KNOWLEDGE_DIR, f), "utf8")) as KnowledgeMaterial,
  );
}

describe("CV-6 · B3 五大家族 failure-pattern 对账（现存 knowledge.fp.* 映射钉死）", () => {
  it("fp 物料集 = 对账表 5 id 精确相等（新增/改名/删条目一律显式破此断言，逼对账表同步修订）", () => {
    const materials = loadFpMaterials();
    const ids = materials.map((m) => m.id).sort();
    expect(ids, "catalog/knowledge/ 的 knowledge.fp.* 集合").toEqual(
      Object.keys(FP_FAMILY_MAPPING).sort(),
    );
    expect(ids).toHaveLength(5);
  });

  it("逐条映射：5 条全部 family=null（不映射到五家族）且独立案例组词形与呈报文档一致；classification=FAILURE_PATTERN / kind=knowledge_entry", () => {
    const byId = new Map(loadFpMaterials().map((m) => [m.id, m]));
    for (const [id, mapping] of Object.entries(FP_FAMILY_MAPPING)) {
      const m = byId.get(id);
      expect(m, `物料在盘：${id}`).toBeDefined();
      expect(mapping.family).toBeNull();
      expect(m?.classification).toBe("FAILURE_PATTERN");
      expect(m?.kind).toBe("knowledge_entry");
      expect(String(m?.axes?.evidence)).toBe("PLANNED");
    }
    // 独立案例组构成：契约漂移 ×2、请求层架构 ×1、共享默认值波及 ×2。
    const groups = Object.values(FP_FAMILY_MAPPING).map((v) => v.group);
    expect(groups.filter((g) => g.startsWith("契约漂移"))).toHaveLength(2);
    expect(groups.filter((g) => g.startsWith("请求层架构"))).toHaveLength(1);
    expect(groups.filter((g) => g.startsWith("共享默认值"))).toHaveLength(2);
  });

  it("五家族逐家判定=缺口（物料层 0/5 覆盖）：没有任何 fp 条目 statement/title 命中任一家族词形", () => {
    const materials = loadFpMaterials();
    const texts = materials.map(
      (m) => `${m.id} ${JSON.stringify(m)}`,
    );
    for (const family of FIVE_FAMILIES) {
      // 家族核心词（「家族名括注前段」）：clobber/检查器双标/授权状态机/分母/假绿——
      // 全部在 5 条物料正文 0 命中 = 缺口判定的物料面依据。
      const core = family.split("（")[0].replace(" 家族", "");
      const hits = texts.filter((t) => t.includes(core));
      expect(hits, `家族「${core}」在 fp 物料层应 0 命中（缺口）`).toHaveLength(0);
    }
  });

  it("对账前提：5 条物料 lifecycle 全 PROPOSED + enforcement 全 advisory（lifecycle 未裁前物料面不动的现状钉死）", () => {
    for (const m of loadFpMaterials()) {
      expect(m.axes?.lifecycle, `${m.id} lifecycle`).toBe("PROPOSED");
      expect(m.enforcement, `${m.id} enforcement`).toBe("advisory");
    }
  });

  it("B3 附带池注记现状：4/5 带 B3 注记，global_td_width 无 B3 注记（R-E 专名清理条目）——注记存在性不等于家族覆盖，防对账叙事被静默改写", () => {
    const byId = new Map(loadFpMaterials().map((m) => [m.id, m]));
    const withB3 = [...byId.entries()]
      .filter(([, m]) => (m.review_notes ?? []).some((n) => n.includes("B3")))
      .map(([id]) => id)
      .sort();
    expect(withB3).toEqual([
      "KNOWLEDGE.FP.API.FIELD_DRIFT_NO_CONTRACT",
      "KNOWLEDGE.FP.API.PER_PAGE_HTTP_CLIENT",
      "KNOWLEDGE.FP.BE.CONTRACT_DRIFT",
      "KNOWLEDGE.FP.CHG.PAGE_LOCAL_PADDING",
    ]);
    expect((byId.get("KNOWLEDGE.FP.GRID.GLOBAL_TD_WIDTH")?.review_notes ?? []).some((n) => n.includes("B3"))).toBe(false);
  });
});
