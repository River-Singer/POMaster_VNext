/**
 * catalog-applicability-case-b.spec.ts —— P0.5-1 Case B 验收集成（tests/integration，L2 账）。
 *
 * PRD v0.5.2 §16 Case B（Catalog Applicability）：Change = 调整 Vue 页面按钮布局；
 * catalog 中存在 Frontend Layout / API Compatibility / DB Transaction 三实体，期望
 * INCLUDE / EXCLUDE unless contract affected / EXCLUDE，每个决定可解释（§5.4）。
 *
 * 诚实边界（裁决 8 ② O9：DB Transaction 验收 fixture-only）：
 * - 真实 catalog 无 DB transaction / backend persistence 条目——对真实 catalog 断言
 *   「DB policy excluded」是空分母假绿。本 spec 的 DB Transaction 实体由 fixture 条目
 *   承载（临时 catalog 副本内新增，绝不改 repo 实物——§92.2 测试构造面）；
 * - API Compatibility 实体用真实 policy.api.* / policy.sec.* 条目（临时副本内补机器
 *   applicability 标注）承载——比合成条目更严的真断言（真实 id/真实正文参与判卷）；
 * - Frontend Layout 实体用真实 frontend-lane 条目承载。
 *
 * W1-A2 T3 标注战役落地后的 fixture 纪律（2026-09-01，裁决 8 ②）：
 * - 真实 catalog 本体已由 T3 批量标注（capabilities + change_classes 多轴）；本 fixture
 *   的 Case B 判卷面是 capabilities 单轴语义（「EXCLUDE unless contract affected」）——
 *   fixture 副本内对 API/Sec 族**重置**机器轴为 capabilities 单轴（剥离 T3 的
 *   change_classes 等其余轴），与真实本体标注的冲突以 T3 实测词面为准、fixture 自标注
 *   隔离判卷面（change_classes 轴判卷归 kernel 单测 + benchmarks/applicability.mjs 注记）；
 * - O7 棘轮的前提（批1时「真实 catalog 全未标注」）已被 T3 消解——棘轮改写为
 *   「fallback_lane=true（未声明机器字段）条目子集带/不带输入逐字节一致」（见下方
 *   O7 describe）。
 */
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  compileProjection,
  createStore,
  explainCatalogProjection,
  loadCatalogPolicies,
  resolveCatalogRoot,
  verifyCatalogLock,
} from "@pomaster/kernel";
import { runCli, runContextCompile, runContextExplain, type CliEnvelope } from "@pomaster/cli";

const REPO_CATALOG = resolveCatalogRoot();

let root: string;
let catalogFixture: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pvnext-w1-case-b-"));
  const tempRoot = mkdtempSync(join(tmpdir(), "pvnext-w1-case-b-cat-"));
  catalogFixture = join(tempRoot, "catalog");
  cpSync(REPO_CATALOG, catalogFixture, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(dirname(catalogFixture), { recursive: true, force: true });
});

/**
 * W1-A2 T3 后：fixture 副本内把条目的机器轴重置为 Case B 判卷面（capabilities 单轴）——
 * 剥离 T3 在真实本体上标注的 change_classes/governance_profiles/object_kinds
 * （真实本体标注以 T3 为准不改动；fixture 自标注隔离判卷面，裁决 8 ② O9 同款 fixture 纪律）。
 */
function resetToCapabilityOnly(policyFile: string, capability: string): void {
  const target = join(catalogFixture, policyFile);
  const body = JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>;
  const appliesWhen = body["applies_when"] as Record<string, unknown>;
  delete appliesWhen["change_classes"];
  delete appliesWhen["governance_profiles"];
  delete appliesWhen["object_kinds"];
  appliesWhen["capabilities"] = [capability];
  writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

/** fixture-only DB Transaction 政策（O9：真实 catalog 无 DB 域条目——空分母假绿免疫）。 */
function addDbTransactionFixture(): void {
  writeFileSync(
    join(catalogFixture, "policies", "policy.db.transaction_boundary.json"),
    `${JSON.stringify(
      {
        id: "POLICY.DB.TRANSACTION_BOUNDARY",
        kind: "policy",
        classification: "LANE_POLICY",
        title_zh: "DB 事务边界统一",
        statement_zh: "涉及多表写一致性的操作必须收敛到单一事务边界（fixture-only 验收实体，O9）。",
        applies_when: {
          lane: "backend",
          condition: "涉及多表写一致性的操作",
          lanes: ["backend"],
          capabilities: ["CAPABILITY.PERSISTENCE"],
        },
        enforcement: "required_when_applicable",
        axes: { lifecycle: "PROPOSED" },
        authority: { owner: "HUMAN_OWNER" },
        x_case_b_fixture: { status: "FIXTURE_ONLY", note: "O9 裁决：DB 验收实体 fixture-only，真实条目挂 catalog 扩容任务" },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

/** Case B 场景装配：API/Sec 条目重置为 capabilities 单轴标注 + DB fixture 条目（Frontend Layout 用真实 lanes 平移条目）。 */
function assembleCaseBFixture(): void {
  // 真实 policy.api.*（3 条）+ policy.web.api.*（17 条）：API Compat 族的更严真断言承载
  // （真实 id/真实正文；capabilities 轴 = 契约面变更才适用——「EXCLUDE unless contract affected」）。
  // W1-A2 T3 后：真实本体已带 change_classes 等多轴标注——fixture 内重置为 capabilities
  // 单轴（resetToCapabilityOnly），隔离 Case B 的 capabilities 判卷面（见文件头注）。
  for (const policy of loadCatalogPolicies(catalogFixture)) {
    if (policy.id.startsWith("POLICY.API.") || policy.id.includes(".WEB.API.")) {
      resetToCapabilityOnly(policy.file, "CAPABILITY.API_CONTRACT");
    }
    if (policy.id === "POLICY.SEC.THIRD_PARTY_EXECUTION_REGISTER") {
      resetToCapabilityOnly(policy.file, "CAPABILITY.API_CONTRACT");
    }
  }
  addDbTransactionFixture();
}

const API_SEC_REF = (ref: string): boolean =>
  ref.startsWith("POLICY.API.") || ref.includes(".API.") || ref.includes(".SEC.");

async function runJson(
  args: readonly string[],
): Promise<{ code: number; envelope: CliEnvelope<Record<string, unknown>> }> {
  const lines: string[] = [];
  const code = await runCli(["--dir", root, ...args, "--json"], {
    stdout: (line) => lines.push(line),
    stderr: () => undefined,
  });
  return {
    code,
    envelope: JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>,
  };
}

// ============================================================
// Case B 主验收（PRD §16）
// ============================================================

describe("Case B：Vue 按钮布局 Change 的 catalog applicability（PRD §16/§5.2-§5.4）", () => {
  it("frontend+CAPABILITY.PRESENTATION：Frontend Layout INCLUDE / API Compat 全族 EXCLUDE / DB Transaction EXCLUDE", async () => {
    await runJson(["init"]);
    assembleCaseBFixture();
    const store = await createStore(root);
    const projection = await compileProjection(
      store,
      { role: "frontend", capabilities: ["CAPABILITY.PRESENTATION"] },
      { catalogRoot: catalogFixture },
    );
    const refs = projection.manifest.catalogEntries.map((entry) => entry.ref);

    // Frontend Layout → INCLUDE（真实 frontend-lane 条目；W1-A2 T3 后为 lanes 平移机器判定）。
    expect(refs).toContain("POLICY.WEB.STYLE.OWNERSHIP_MATRIX");
    expect(refs).toContain("POLICY.WEB.GRID.COLUMN_SCHEMA_FIELDS");

    // API Compat → EXCLUDE unless contract affected：真实 policy.api.* / policy.web.api.* 全族不在场。
    for (const ref of refs.filter(API_SEC_REF)) {
      expect.unreachable(`API/Sec 条目不应注入纯呈现 Change：${ref}`);
    }
    expect(verifyCatalogLock(catalogFixture).ok).toBe(false); // fixture 不重锁：漂移与本验收正交（lock 漂移 WARN 不阻断）

    // DB Transaction → EXCLUDE（fixture 条目 lanes=[backend]+capabilities=[PERSISTENCE]）。
    expect(refs).not.toContain("POLICY.DB.TRANSACTION_BOUNDARY");

    // 后端持久化 Change 的正向对照：role=backend+CAPABILITY.PERSISTENCE → DB fixture INCLUDE
    //（排除是 applicability 判定而非条目缺席——fixture 判卷为真）。
    const backend = await compileProjection(
      store,
      { role: "backend", capabilities: ["CAPABILITY.PERSISTENCE"] },
      { catalogRoot: catalogFixture },
    );
    expect(
      backend.manifest.catalogEntries.map((entry) => entry.ref),
    ).toContain("POLICY.DB.TRANSACTION_BOUNDARY");
  });

  it("unless contract affected：声明 CAPABILITY.API_CONTRACT 后 API Compat 全族恢复 INCLUDE（Case B 分支语义）", async () => {
    await runJson(["init"]);
    assembleCaseBFixture();
    const store = await createStore(root);
    const contractAffected = await compileProjection(
      store,
      { role: "frontend", capabilities: ["CAPABILITY.PRESENTATION", "CAPABILITY.API_CONTRACT"] },
      { catalogRoot: catalogFixture },
    );
    const refs = contractAffected.manifest.catalogEntries.map((entry) => entry.ref);
    expect(refs).toContain("POLICY.WEB.API.SINGLE_HTTP_CLIENT");
    expect(refs).toContain("POLICY.API.BACKWARD_COMPAT_DEFAULTS");
    // DB Transaction 仍 EXCLUDE（PERSISTENCE 能力仍未声明——逐轴独立判定）。
    expect(refs).not.toContain("POLICY.DB.TRANSACTION_BOUNDARY");
  });

  it("每个决定可解释（PRD §5.4）：explain 决策面逐条 why，included/excluded 两面分母全量", async () => {
    await runJson(["init"]);
    assembleCaseBFixture();
    const store = await createStore(root);
    const explanation = await explainCatalogProjection(
      store,
      { role: "frontend", capabilities: ["CAPABILITY.PRESENTATION"] },
      { catalogRoot: catalogFixture },
    );
    const byId = new Map(explanation.decisions.map((decision) => [decision.ref, decision]));

    // INCLUDE 决策可解释（W1-A2 T3 后：OWNERSHIP_MATRIX 已 lanes 平移——机器判定词形；
    // lane 回退代表见 fallback_lane 断言面）。
    const layout = byId.get("POLICY.WEB.STYLE.OWNERSHIP_MATRIX");
    expect(layout?.decision).toBe("included");
    expect(layout?.why_included).toContain("lanes=frontend 命中 role=frontend");
    // O7 lane 回退实证面：lane=any 未标轴条目保持旧词形 + fallback_lane=true。
    const fallback = byId.get("POLICY.WEB.COPY.SUPPRESSION_LEDGER_DISCIPLINE");
    expect(fallback?.decision).toBe("included");
    expect(fallback?.why_included).toContain("lane=any 命中 role=frontend");
    expect(fallback?.fallback_lane).toBe(true);

    // API Compat EXCLUDE 决策可解释（capabilities 轴无交集——「unless contract affected」的机器语义）。
    const api = byId.get("POLICY.WEB.API.SINGLE_HTTP_CLIENT");
    expect(api?.decision).toBe("excluded");
    expect(api?.why_excluded).toContain("capabilities=[CAPABILITY.API_CONTRACT]");
    expect(api?.why_excluded).toContain("无交集");

    // DB Transaction EXCLUDE 决策可解释（lanes 轴未命中 role=frontend）。
    const db = byId.get("POLICY.DB.TRANSACTION_BOUNDARY");
    expect(db?.decision).toBe("excluded");
    expect(db?.why_excluded).toContain("lanes=[backend] 未命中 role=frontend");

    // 决策分母 = policies 全集 + presets（每个 catalog 条目都有决定）。
    expect(explanation.decisions.length).toBe(loadCatalogPolicies(catalogFixture).length + 1);
  });

  it("CLI 面实跑：context explain --role --capability 逐条 why + context compile 的 CATALOG 分区不含 API/Sec", async () => {
    expect((await runJson(["init"])).code).toBe(0);
    assembleCaseBFixture();

    // compile（catalogRoot 经 kernel options 注入不可达 CLI，此处以函数级 API 断言分区）。
    const compile = await runContextCompile(root, "frontend", {
      compileProjection: async (store, request) => {
        const { compileProjection: real } = await import("@pomaster/kernel");
        return real(store, request, { catalogRoot: catalogFixture });
      },
    }, { capabilities: ["CAPABILITY.PRESENTATION"] });
    expect(compile.ok).toBe(true);
    for (const entry of compile.result.manifest.catalog_entries) {
      expect(API_SEC_REF(entry.ref)).toBe(false);
    }

    // explain 命令级实跑（deps 注入 catalogRoot）。
    const explain = await runContextExplain(root, "frontend", {
      explainCatalogProjection: async (store, request) => {
        const { explainCatalogProjection: real } = await import("@pomaster/kernel");
        return real(store, request, { catalogRoot: catalogFixture });
      },
    }, { capabilities: ["CAPABILITY.PRESENTATION"] });
    expect(explain.ok).toBe(true);
    const excluded = explain.result.decisions.filter((d) => d.decision === "excluded");
    expect(excluded.length).toBeGreaterThan(0);
    expect(excluded.map((d) => d.ref)).toContain("POLICY.WEB.API.SINGLE_HTTP_CLIENT");
    expect(excluded.map((d) => d.ref)).toContain("POLICY.DB.TRANSACTION_BOUNDARY");
  });

  it("全命令面冒烟：runCli context compile/explain 词汇形与旗标注册（真实 catalog，exit 0）", async () => {
    expect((await runJson(["init"])).code).toBe(0);
    const compile = await runJson([
      "context", "compile",
      "--role", "frontend",
      "--capability", "CAPABILITY.PRESENTATION",
      "--change-class", "PRESENTATION_CHANGE",
    ]);
    expect(compile.code).toBe(0);
    expect((compile.envelope.result as { applicability?: Record<string, unknown> }).applicability)
      .toEqual({
        change: null,
        capabilities: ["CAPABILITY.PRESENTATION"],
        change_class: "PRESENTATION_CHANGE",
      });
    const explain = await runJson([
      "context", "explain",
      "--role", "frontend",
      "--capability", "CAPABILITY.PRESENTATION",
    ]);
    expect(explain.code).toBe(0);
    const decisions = (explain.envelope.result as { decisions?: { decision: string; ref: string }[] })
      .decisions ?? [];
    expect(decisions.length).toBeGreaterThan(0);
    for (const decision of decisions) {
      expect(["included", "excluded"]).toContain(decision.decision);
    }
  });
});

// ============================================================
// O7 行为零变化棘轮（裁决 8 ②：未标注条目=lane 回退，行为零变化）
// W1-A2 T3 后改写（2026-09-01）：批1前提「真实 catalog 全未标注」已被 T3 标注战役消解——
// 带全量输入 vs 不带输入的全量逐字节一致不再是有效不变量（标注条目按声明轴生效=设计内）。
// 存活棘轮 = fallback_lane=true（未声明任何机器字段）条目子集：带/不带输入决策与
// catalogEntries 原文逐字节一致（O7 的精确存活面）。
// ============================================================

describe("O7 行为零变化棘轮（T3 后：fallback 条目子集逐字节一致）", () => {
  it("fallback_lane=true 条目：带全量 applicability 输入与不带输入决策+reason 逐字节一致", async () => {
    await runJson(["init"]);
    const store = await createStore(root);
    const plainRequest = { role: "frontend" } as const;
    const fullInputs = {
      role: "frontend",
      capabilities: ["CAPABILITY.PRESENTATION", "CAPABILITY.API_CONTRACT"],
      changeClass: "PRESENTATION_CHANGE",
    } as const;
    const plain = await compileProjection(store, plainRequest);
    const withInputs = await compileProjection(store, fullInputs);
    const plainExplain = await explainCatalogProjection(store, plainRequest);
    const fullExplain = await explainCatalogProjection(store, fullInputs);

    // fallback 分母非空（T3 后仍有大半条目未声明机器字段——保守派生纪律）。
    const plainByRef = new Map(plainExplain.decisions.map((d) => [d.ref, d]));
    const fullByRef = new Map(fullExplain.decisions.map((d) => [d.ref, d]));
    const fallbackRefs = [...plainByRef.values()]
      .filter((d) => d.fallback_lane && d.file.startsWith("policies/"))
      .map((d) => d.ref);
    expect(fallbackRefs.length).toBeGreaterThan(0);
    // fallback 条目：两侧判定路径同为 lane 回退（带输入不切换判定模式）。
    for (const ref of fallbackRefs) {
      expect(fullByRef.get(ref)?.fallback_lane).toBe(true);
    }

    // 逐字节一致面：catalogEntries 中 fallback 条目的 {ref, reason} 两侧全等。
    const pickFallback = (projection: typeof plain) =>
      projection.manifest.catalogEntries.filter((entry) => fallbackRefs.includes(entry.ref));
    expect(pickFallback(withInputs)).toEqual(pickFallback(plain));

    // 对照：标注条目带输入生效（全量输入下 API 族 capabilities 命中恢复 INCLUDE——
    // 与无输入编译的差集非空，证明输入轴真实参与判定，棘轮不是空转）。
    const plainRefs = new Set(plain.manifest.catalogEntries.map((e) => e.ref));
    const gained = withInputs.manifest.catalogEntries
      .map((e) => e.ref)
      .filter((ref) => !plainRefs.has(ref));
    expect(gained).toContain("POLICY.WEB.API.SINGLE_HTTP_CLIENT");
  });

  it("repo 实物未被本验收触碰（§92.2 测试构造面纪律：fixture 全部落在 mkdtemp 副本内）", () => {
    // DB fixture 只存在于临时副本；repo policies 无泄漏（lock 对账状态归 producer 批次，非本 spec 职责）。
    const policyFiles = readdirSync(join(REPO_CATALOG, "policies"));
    expect(policyFiles).not.toContain("policy.db.transaction_boundary.json");
  });
});
