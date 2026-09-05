/**
 * spec-preplant.spec.ts —— SPEC.* Evidence Spec 对象 init 预植（裁定批 D D2 /
 * Owner 2026-09-05 裁定 (a)：init 预植——新治理语义，init 从此写 store）。
 *
 * 钉面（spec-preplant.ts ADR 逐项）：
 * - 19 分母钉：预植计划 = 19 份 evidence spec（index.md 不预植——索引非 spec）；
 *   id = 头行 对象面词形（词形与对象 id 单源，19 id 逐字清单——漂移即爆）；
 * - requirements 派生逻辑测试钉：对象 requirements 与播种件判定段（Assertions /
 *   Required Artifacts——PRD §13.1 判定条款位）一一对应（文档序、段落锚逐字、
 *   clause_id 机械大写蛇形、claim_refs/gate_refs 留空、proof_type 常量——零凭空
 *   发明）；
 * - init 端到端：单事务 19 对象入账（seq 1、journal TX_APPLIED、零墙钟）、
 *   PROPOSED/UNRESOLVED/PLANNED/STABLE 轴起步、BOOTSTRAP_OWNER、ingested、
 *   provenance pin（digest = 种子字节）、A1 正文成对、A3 纪律零改动（预植走对象
 *   upsert 非 claim 通路——claims/runs 平面零文件）；
 * - 幂等/重入（seed-once）：重跑 preserved=19 零变化零 journal 增行；对象缺席才
 *   预植（删行补植）；在座零触碰（项目转移 CURRENT 后重跑不被回写 PROPOSED）；
 * - off-switch（InitOptions.specPreplant=false → null + 零对象）；doctor/status
 *   spec_preplant 呈现（seeded_assets 先例）；幽灵 owner → SPEC_PREPLANT_SKIPPED
 *   warning + init 照常完成（fail-closed 呈现零部分落盘）；
 * - closeout 协同：预植对象无绑定 → 不进判卷分母（诚实缺席，零 SPEC_NOT_BINDING）。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SPEC_PREPLANT_PROOF_TYPE,
  SPEC_PREPLANT_SKIPPED_WARNING,
  buildSpecPreplantPlan,
  loadSeedManifestEntries,
  runCloseout,
  runDoctor,
  runInit,
  runStatus,
  seedsRootCandidates,
  sha256Hex,
  type SpecPreplantPlanEntry,
} from "@pomaster/cli";
import { applyTransaction, createStore } from "@pomaster/kernel";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-spec-preplant-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// 19 分母逐字清单（= B6e Kit 头行 对象面词形全集；漂移即爆）。
const EXPECTED_SPEC_IDS = [
  "SPEC.ACCESSIBILITY",
  "SPEC.ARCHITECTURE",
  "SPEC.BROWSER_E2E",
  "SPEC.BUILD",
  "SPEC.BUSINESS_ACCEPTANCE",
  "SPEC.COMPLEXITY_CRAP",
  "SPEC.CONTRACT",
  "SPEC.COVERAGE",
  "SPEC.DATA_MIGRATION",
  "SPEC.DEAD_CODE_DUPLICATE",
  "SPEC.DEPENDENCY_SUPPLY_CHAIN",
  "SPEC.MUTATION",
  "SPEC.PERFORMANCE",
  "SPEC.RELEASE",
  "SPEC.RUNTIME_OBSERVABILITY",
  "SPEC.SECURITY",
  "SPEC.TYPECHECK_LINT",
  "SPEC.UNIT_COMPONENT_INTEGRATION",
  "SPEC.VISUAL_REGRESSION",
] as const;

// 判定条款段集（PRD §13.1 判定条款位——测试侧独立词形，与实现锚同源 17 段结构）。
const JUDGMENT_SECTIONS = ["Assertions", "Required Artifacts"] as const;

const seedsRoot = seedsRootCandidates(import.meta.url)[0]!;

function plan(): readonly SpecPreplantPlanEntry[] {
  return buildSpecPreplantPlan(loadSeedManifestEntries());
}

function readLedger(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(dir, ".pomaster", "state", "truth-index.json"), "utf8"),
  ) as Record<string, unknown>;
}

function ledgerObjectRows(): Array<Record<string, unknown>> {
  return readLedger().objects as Array<Record<string, unknown>>;
}

function mutateLedger(mutator: (ledger: Record<string, unknown>) => void): void {
  const path = join(dir, ".pomaster", "state", "truth-index.json");
  const ledger = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  mutator(ledger);
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function dropSpecRow(specId: string): void {
  mutateLedger((ledger) => {
    ledger.objects = (ledger.objects as Array<Record<string, unknown>>).filter(
      (row) => row.id !== specId,
    );
  });
}

function journalLines(): Array<Record<string, unknown>> {
  return readFileSync(join(dir, ".pomaster", "state", "journal.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

// ============================================================
// 预植计划派生（19 分母钉 + requirements 一一对应测试钉）
// ============================================================

describe("预植计划派生（D2 ADR-1/ADR-4）", () => {
  it("19 分母钉：index.md 不预植（索引非 spec）；id = 头行词形，19 id 逐字清单", () => {
    const entries = plan();
    expect(entries).toHaveLength(19);
    expect(entries.map((entry) => entry.specId)).toEqual([...EXPECTED_SPEC_IDS].sort());
    expect(new Set(entries.map((entry) => entry.specId)).size).toBe(19);
    for (const entry of entries) {
      expect(entry.slug).not.toBe("index");
      expect(entry.assetRef).toBe(`specs/evidence/${entry.slug}.md`);
      expect(entry.seededRef).toBe(`.pomaster/specs/evidence/${entry.slug}.md`);
      expect(entry.contentDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.title.startsWith("Evidence Spec — ")).toBe(true);
    }
  });

  it("requirements 与播种件判定段一一对应（文档序 + 段落锚逐字 + 留空资格清单——零凭空发明）", () => {
    for (const entry of plan()) {
      const text = readFileSync(join(seedsRoot, entry.assetRef), "utf8");
      const judgmentSections = text
        .split("\n")
        .filter((line) => line.startsWith("## "))
        .map((line) => line.slice(3).trim())
        .filter((section): section is (typeof JUDGMENT_SECTIONS)[number] =>
          (JUDGMENT_SECTIONS as readonly string[]).includes(section),
        );
      expect(judgmentSections, entry.specId).toEqual([...JUDGMENT_SECTIONS]);
      expect(entry.requirements.map((clause) => clause.description)).toEqual(
        judgmentSections.map((section) => `${entry.assetRef} §${section}`),
      );
      expect(entry.requirements.map((clause) => clause.clause_id)).toEqual(
        judgmentSections.map((section) => section.toUpperCase().replace(/[^A-Z0-9]+/g, "_")),
      );
      for (const clause of entry.requirements) {
        expect(clause.proof_type, entry.specId).toBe(SPEC_PREPLANT_PROOF_TYPE);
        expect(clause.proof_type).toBe("spec_section_anchor");
        expect(clause.claim_refs).toEqual([]); // 资格清单留空——项目运行时按需填充
        expect(clause.gate_refs).toEqual([]);
      }
    }
  });
});

// ============================================================
// init 端到端（fresh：单事务入账 / 轴起步 / provenance / 零墙钟 / A3 零改动）
// ============================================================

describe("init 端到端预植（D2 ADR-2/5/6/10）", () => {
  it("fresh init：19 对象单事务入账（seq=1、journal TX_APPLIED、PROPOSED 起步、BOOTSTRAP_OWNER、正文成对）", async () => {
    const outcome = await runInit(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.specPreplant).toEqual({ planted: 19, preserved: 0, skipped: false });
    expect(outcome.result.change).toBe("CREATED");

    const rows = ledgerObjectRows();
    expect(rows).toHaveLength(19);
    expect(rows.map((row) => row.id).sort()).toEqual([...EXPECTED_SPEC_IDS].sort());
    for (const row of rows) {
      expect(row.kind).toBe("business_rule");
      expect(row.axes).toEqual({
        lifecycle: "PROPOSED",
        confidence: "UNRESOLVED",
        evidence: "PLANNED",
        change: "STABLE",
      });
      expect(row.authority_owner).toBe("BOOTSTRAP_OWNER");
      expect(row.origin).toBe("ingested");
      // A1 正文成对：索引行在而正文在座。
      expect(existsSync(join(dir, ".pomaster", ...(row.body_ref as string).split("/")))).toBe(true);
    }

    const applied = journalLines();
    expect(applied).toHaveLength(1);
    expect(applied[0]?.type).toBe("TX_APPLIED");
    expect(applied[0]?.seq).toBe(1);
    expect((applied[0]?.ops as string[]).every((op) => op === "upsert_object")).toBe(true);
    expect(applied[0]?.changed_object_ids).toEqual([...EXPECTED_SPEC_IDS].sort());
  });

  it("payload 形态：spec_kind=evidence_spec + 判定条款段锚 + provenance pin（digest = 种子字节）", async () => {
    await runInit(dir);
    const row = ledgerObjectRows().find((candidate) => candidate.id === "SPEC.BUILD");
    expect(row).toBeDefined();
    const body = JSON.parse(
      readFileSync(join(dir, ".pomaster", ...(row!.body_ref as string).split("/")), "utf8"),
    ) as Record<string, unknown>;
    const payload = body.payload as Record<string, unknown>;
    expect(payload.spec_kind).toBe("evidence_spec");
    expect(payload.title).toBe("Evidence Spec — 构建成功");
    const requirements = payload.requirements as Array<Record<string, unknown>>;
    expect(requirements).toEqual([
      {
        clause_id: "ASSERTIONS",
        proof_type: "spec_section_anchor",
        description: "specs/evidence/build.md §Assertions",
        claim_refs: [],
        gate_refs: [],
      },
      {
        clause_id: "REQUIRED_ARTIFACTS",
        proof_type: "spec_section_anchor",
        description: "specs/evidence/build.md §Required Artifacts",
        claim_refs: [],
        gate_refs: [],
      },
    ]);
    const sources = body.sources as Array<Record<string, unknown>>;
    expect(sources).toHaveLength(1);
    expect(sources[0]?.type).toBe("design_seed");
    expect(sources[0]?.ref).toBe(".pomaster/specs/evidence/build.md");
    expect(sources[0]?.captured_by).toBe("tool:pomaster-init");
    const seededBytes = readFileSync(
      join(dir, ".pomaster", "specs", "evidence", "build.md"),
      "utf8",
    );
    expect((sources[0]?.pin as Record<string, string>).digest).toBe(
      `sha256:${sha256Hex(seededBytes)}`,
    );
  });

  it("零墙钟（A4）：truth-index / journal / 对象正文无 ISO 时间戳词形", async () => {
    await runInit(dir);
    const ledgerText = readFileSync(
      join(dir, ".pomaster", "state", "truth-index.json"),
      "utf8",
    );
    const journalText = readFileSync(join(dir, ".pomaster", "state", "journal.jsonl"), "utf8");
    const buildBody = ledgerObjectRows().find((row) => row.id === "SPEC.BUILD");
    const bodyText = readFileSync(
      join(dir, ".pomaster", ...(buildBody!.body_ref as string).split("/")),
      "utf8",
    );
    for (const text of [ledgerText, journalText, bodyText]) {
      expect(/\d{4}-\d{2}-\d{2}T/.test(text)).toBe(false);
    }
  });

  it("A3/store 纪律零改动：预植走对象 upsert 非 claim 通路——claims/runs 平面零文件", async () => {
    await runInit(dir);
    // evidence/claims/、evidence/runs/ 目录缺席或为空（record_claim 语义未被预植借用；
    // A3 不可覆写 / UNVERIFIED 强制等 store 纪律零触碰——对象 upsert 不在 A3 管辖面）。
    const { readdirSync } = await import("node:fs");
    const safeList = (path: string): string[] => {
      try {
        // 布局步骤预铺的 README.md 非证据文件（与播种/判卷分母同款口径）。
        return readdirSync(path).filter((name) => name !== "README.md");
      } catch {
        return [];
      }
    };
    expect(safeList(join(dir, ".pomaster", "evidence", "claims"))).toEqual([]);
    expect(safeList(join(dir, ".pomaster", "evidence", "runs"))).toEqual([]);
  });
});

// ============================================================
// 幂等 / 重入（seed-once：在座零触碰、缺席才预植）
// ============================================================

describe("幂等与重入（D2 ADR-6 seed-once）", () => {
  it("重跑 init → NO_CHANGE + preserved=19；账本字节不变；journal 零增行", async () => {
    await runInit(dir);
    const ledgerBefore = readFileSync(
      join(dir, ".pomaster", "state", "truth-index.json"),
      "utf8",
    );
    const journalBefore = readFileSync(join(dir, ".pomaster", "state", "journal.jsonl"), "utf8");
    const second = await runInit(dir);
    expect(second.ok).toBe(true);
    expect(second.result.change).toBe("NO_CHANGE");
    expect(second.result.specPreplant).toEqual({ planted: 0, preserved: 19, skipped: false });
    expect(
      readFileSync(join(dir, ".pomaster", "state", "truth-index.json"), "utf8"),
    ).toBe(ledgerBefore);
    expect(readFileSync(join(dir, ".pomaster", "state", "journal.jsonl"), "utf8")).toBe(
      journalBefore,
    );
  });

  it("对象缺席才预植：删行+删正文后重跑 → planted=1 preserved=18，SPEC.BUILD 恢复", async () => {
    await runInit(dir);
    const bodyRow = ledgerObjectRows().find((row) => row.id === "SPEC.BUILD");
    rmSync(join(dir, ".pomaster", ...(bodyRow!.body_ref as string).split("/")));
    dropSpecRow("SPEC.BUILD");
    const rerun = await runInit(dir);
    expect(rerun.ok).toBe(true);
    expect(rerun.result.specPreplant).toEqual({ planted: 1, preserved: 18, skipped: false });
    // change 桶诚实：store 新增治理事实 → CREATED（即使文件面全 preserved）。
    expect(rerun.result.change).toBe("CREATED");
    expect(ledgerObjectRows()).toHaveLength(19);
    const restored = ledgerObjectRows().find((row) => row.id === "SPEC.BUILD");
    expect(existsSync(join(dir, ".pomaster", ...(restored!.body_ref as string).split("/")))).toBe(
      true,
    );
  });

  it("在座零触碰：项目把 SPEC.BUILD 转移 CURRENT 后重跑 init → preserved 不回写 PROPOSED", async () => {
    await runInit(dir);
    const store = await createStore(dir);
    const applied = await applyTransaction(store, {
      ops: [{ op: "transition_object", id: "SPEC.BUILD", patch: { lifecycle: "CURRENT" } }],
      authorityRef: "DECISION.PREPLANT_ADOPT",
    });
    expect(applied.shortCircuited).toBe(false);
    const rerun = await runInit(dir);
    expect(rerun.ok).toBe(true);
    // change=UPDATED 是既有投影行为（转移令 seq 前进 → 入口状态速览刷新 AGENTS.md），
    // 非预植回写——预植本侧 preserved 零触碰（见下两断言）。
    expect(rerun.result.change).toBe("UPDATED");
    expect(rerun.result.specPreplant).toEqual({ planted: 0, preserved: 19, skipped: false });
    const row = ledgerObjectRows().find((candidate) => candidate.id === "SPEC.BUILD");
    expect((row!.axes as Record<string, unknown>).lifecycle).toBe("CURRENT");
  });
});

// ============================================================
// off-switch / 呈现 / 失败语义
// ============================================================

describe("off-switch、doctor/status 呈现与失败语义（D2 ADR-7/8/9）", () => {
  it("off-switch：specPreplant=false → 结果 null、零对象、seq=0；随后缺省重跑补植 19", async () => {
    const off = await runInit(dir, { specPreplant: false });
    expect(off.ok).toBe(true);
    expect(off.result.specPreplant).toBeNull();
    expect(ledgerObjectRows()).toEqual([]);
    expect((readLedger().generation as Record<string, unknown>).seq).toBe(0);
    const on = await runInit(dir);
    expect(on.result.specPreplant).toEqual({ planted: 19, preserved: 0, skipped: false });
    expect(on.result.change).toBe("CREATED");
    expect(ledgerObjectRows()).toHaveLength(19);
  });

  it("doctor/status 呈现：spec_preplant {in_place, kit} + human 行（seeded_assets 先例）", async () => {
    await runInit(dir);
    const status = await runStatus(dir);
    expect(status.ok).toBe(true);
    expect(status.result.spec_preplant).toEqual({ in_place: 19, kit: 19 });
    expect(status.human.join("\n")).toContain("spec preplant: 19/19 in place");
    const doctor = await runDoctor(dir);
    expect(doctor.result.spec_preplant).toEqual({ in_place: 19, kit: 19 });
    expect(doctor.human.join("\n")).toContain("spec preplant: 19/19 in place");
  });

  it("呈现缺席显式：未初始化 → status spec_preplant 字段缺席；off-switch 项目 → 0/19 in place", async () => {
    const freshStatus = await runStatus(dir);
    expect(freshStatus.ok).toBe(false);
    expect(freshStatus.result.spec_preplant).toBeUndefined();
    await runInit(dir, { specPreplant: false });
    const offStatus = await runStatus(dir);
    expect(offStatus.result.spec_preplant).toEqual({ in_place: 0, kit: 19 });
    expect(offStatus.human.join("\n")).toContain("spec preplant: 0/19 in place");
  });

  it("幽灵 owner（人类演进 authority 后无 BOOTSTRAP_OWNER）→ SPEC_PREPLANT_SKIPPED warning + init 照常完成", async () => {
    await runInit(dir);
    dropSpecRow("SPEC.BUILD");
    const humanAuthority = { version: 1, authorities: { HUMAN_OWNER: {} } };
    writeFileSync(
      join(dir, ".pomaster", "state", "authority.json"),
      `${JSON.stringify(humanAuthority, null, 2)}\n`,
      "utf8",
    );
    const rerun = await runInit(dir);
    expect(rerun.ok).toBe(true); // init 文件面不受预植失败拖垮（ADR-8）
    expect(rerun.warnings.map((warning) => warning.code)).toContain(
      SPEC_PREPLANT_SKIPPED_WARNING,
    );
    expect(rerun.warnings.find((warning) => warning.code === SPEC_PREPLANT_SKIPPED_WARNING)
      ?.message).toContain("GHOST_AUTHORITY_OWNER");
    expect(rerun.result.specPreplant).toEqual({ planted: 0, preserved: 18, skipped: true });
    expect(ledgerObjectRows()).toHaveLength(18); // 缺席对象未预植（零部分落盘）
  });
});

// ============================================================
// closeout 协同（B2 裁定不偷改：PROPOSED 不绑定判卷）
// ============================================================

describe("closeout 协同（预植对象无绑定 → 诚实缺席）", () => {
  it("预植 SPEC 对象零绑定：closeout 判卷分母无 Spec 维度（dod.spec=null，零 SPEC_NOT_BINDING）", async () => {
    await runInit(dir);
    const store = await createStore(dir);
    const upsert = await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "TASK.PREPLANT_PROBE",
            kind: "task_object",
            axisProfile: "task_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "预植探针任务",
            authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
            origin: "natural",
            payload: {
              intent: "验证预植对象不进 closeout 判卷分母",
              acceptance: [],
              class_scan_result: { scope: "src/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-0" },
            },
          },
        },
      ],
    });
    expect(upsert.shortCircuited).toBe(false);
    const outcome = await runCloseout(dir, { taskId: "TASK.PREPLANT_PROBE" });
    // 其他维度的阻断照常（acceptance 空 / gate 缺席），但 Spec 维度零绑定诚实缺席。
    expect(outcome.ok).toBe(false);
    expect(outcome.result.dod?.spec ?? null).toBeNull();
    expect(
      outcome.warnings.filter((warning) => warning.code === "SPEC_NOT_BINDING"),
    ).toEqual([]);
  });
});
