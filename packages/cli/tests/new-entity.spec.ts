/**
 * new-entity.spec.ts —— `pomaster new-entity check`（09-04 vNext Batch 1 R5；Owner
 * 裁定 D5——PRD §5A New Entity Gate 运行时接线）。
 *
 * 覆盖锚点：
 * - 判卷零旁移：CLI 转调 kernel runNewEntityGate 单一实现（failed/passed/
 *   skipped_blindspot 三态真判 + denied_by 五否明细呈现）；
 * - 施断强度 = verdict 呈现 + exit code：passed → ok=true；failed/skipped_blindspot
 *   → ok=false（failed 非 0 exit 是 D5 明文）；**不改 store applyTransaction 创建
 *   路径**（创建路径前置施断留 Proposal，宪法 §9/C4——本 spec 的 failed 判卷后
 *   store 依旧可正常 applyTransaction，边界由「零阻断」断言钉住）；
 * - check --gates 纳入：kernel-native 执行器注入 → NEW_ENTITY 行 not_run 显式缺席
 *   （零候选——候选施断面是 new-entity check），tool 三件套保留 kernel 执行者身份；
 * - `pomaster resolve` 的 required_gates 披露保持不变（resolve.ts 零改动锚）。
 */
import { rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore, type Store } from "@pomaster/kernel";
import {
  newEntityKernelGateExecutor,
  runCheckGates,
  runNewEntityCheck,
  runResolve,
  type GatesCheckResult,
  type NewEntityCheckResult,
} from "@pomaster/cli";

let root: string;
let store: Store | null = null;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-new-entity-"));
});

afterEach(() => {
  store = null;
  rmSync(root, { recursive: true, force: true });
});

async function initStore(): Promise<Store> {
  store = await createStore(root);
  return store;
}

describe("new-entity check（kernel runNewEntityGate 施断面）", () => {
  it("failed：需求命中既有标准件（searchable select 组合链）→ verdict=failed + denied_by 明细 + ok=false", async () => {
    await initStore();
    const outcome = await runNewEntityCheck({
      rootDir: root,
      governedId: "COMPONENT.CAR_SEARCH_SELECT",
      need: "可搜索车型选择器 searchable select combobox",
    });
    expect(outcome.ok).toBe(false);
    const result = outcome.result as NewEntityCheckResult;
    expect(result.verdict).toBe("failed");
    expect(result.judgements).toHaveLength(1);
    expect(result.judgements[0]?.disposition).toBe("denied");
    expect(result.judgements[0]?.denied_by.length).toBeGreaterThan(0);
    expect(result.judgements[0]?.sources_examined.catalog_archetypes).toBeGreaterThan(0);
    expect(outcome.errors[0]?.code).toBe("GATE_FAILED");
    expect(outcome.human.join("\n")).toContain("denied_by=");
  });

  it("passed：NO_MATCH 且分母在场 → verdict=passed + ok=true（五否证明成立的显式放行）", async () => {
    await initStore();
    const outcome = await runNewEntityCheck({
      rootDir: root,
      governedId: "COMPONENT.COST_HEATMAP",
      need: "成本热力图 heatmap 成本矩阵可视化",
    });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as NewEntityCheckResult;
    expect(result.verdict).toBe("passed");
    expect(result.judgements[0]?.disposition).toBe("allowed");
    expect(result.judgements[0]?.sources_examined.catalog_archetypes).toBeGreaterThan(0);
  });

  it("skipped_blindspot：文法外词形 → verdict=skipped_blindspot + ok=false（盲区显式非假红）", async () => {
    await initStore();
    const outcome = await runNewEntityCheck({
      rootDir: root,
      governedId: "component.not_screaming",
      need: "任意需求",
    });
    expect(outcome.ok).toBe(false);
    const result = outcome.result as NewEntityCheckResult;
    expect(result.verdict).toBe("skipped_blindspot");
    expect(result.judgements[0]?.denied_by).toContain("grammar_invalid");
    expect(outcome.errors[0]?.code).toBe("GATE_SKIPPED_BLINDSPOT");
  });

  it("store 未初始化 → NOT_CONFIGURED fail-closed（「没查」≠「查了没有」）", async () => {
    const outcome = await runNewEntityCheck({
      rootDir: root,
      governedId: "COMPONENT.ANY_THING",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_CONFIGURED");
  });

  it("创建路径零改动（宪法 §9/C4 Proposal 边界）：failed 判卷后 applyTransaction 照常入账——gate 不阻断 store 写路径", async () => {
    const created = await initStore();
    // 登记 owner（createStore 骨架 authorities 为空——幽灵 owner FATAL 解析源，与 gate 无关）。
    const { readFileSync, writeFileSync } = await import("node:fs");
    const authorityPath = join(root, ".pomaster", "state", "authority.json");
    const authority = JSON.parse(readFileSync(authorityPath, "utf8")) as {
      authorities: Record<string, unknown>;
    };
    authority.authorities["BUSINESS_OWNER"] = {};
    writeFileSync(authorityPath, `${JSON.stringify(authority, null, 2)}\n`, "utf8");
    const first = await runNewEntityCheck({
      rootDir: root,
      governedId: "COMPONENT.CAR_SEARCH_SELECT",
      need: "可搜索车型选择器 searchable select combobox",
    });
    expect(first.ok).toBe(false); // 判卷拒绝
    // 创建路径零前置施断：同一词形照常落库（复用/在册语义归 store 侧判卷）。
    const applied = await applyTransaction(created, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "COMPONENT.CAR_SEARCH_SELECT",
            kind: "component",
            axisProfile: "component_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "车型可搜索选择器",
            authority: { owner: "BUSINESS_OWNER", delegates: [] },
            origin: "natural",
            payload: {},
          } as never,
        },
      ],
    });
    expect(applied.changedObjectIds).toContain("COMPONENT.CAR_SEARCH_SELECT");
  });
});

describe("check --gates 的 kernel-native 纳入（R5）", () => {
  it("NEW_ENTITY 行 = not_run 显式缺席（零候选），tool=kernel 执行者，note 指路施断面", async () => {
    await initStore();
    const outcome = await runCheckGates(root, {
      store: store as Store,
      kernelGates: { "GATE.NEW_ENTITY.CHECKS": newEntityKernelGateExecutor() },
    });
    expect(outcome.ok).toBe(false); // 六 recipe 全非 passed（缺席不是通过）
    const result = outcome.result as GatesCheckResult;
    expect(result.recipes_total).toBe(6);
    const row = result.rows.find((candidate) => candidate.recipe === "GATE.NEW_ENTITY.CHECKS");
    expect(row).toBeDefined();
    expect(row?.verdict).toBe("not_run");
    expect(row?.tool).toBe("kernel:run_new_entity_gate");
    expect(row?.metric_dialect).toBe("kernel:new_entity_gate");
    expect(row?.note).toContain("pomaster new-entity check");
    expect(row?.grn).toMatch(/^GRN-[0-9]+$/);
  });

  it("resolve 的 required_gates 披露保持不变（NO_MATCH 与命中都披露 NEW_ENTITY 锚——resolve.ts 零改动）", async () => {
    await initStore();
    const outcome = await runResolve({ rootDir: root, need: "成本热力图 heatmap" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { required_gates: readonly string[] };
    expect(result.required_gates).toContain("POLICY.GATE.NEW_ENTITY.CHECKS@0.1.0");
  });
});
