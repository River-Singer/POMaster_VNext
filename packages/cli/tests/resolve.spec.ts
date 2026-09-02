/**
 * resolve.spec.ts —— `pomaster resolve` 命令面（P-v06 批次 0；PRD v0.6 §98 +
 * v0.6.1 §69/§73/§87）。
 *
 * 判据锚：
 * - 判卷权威在 kernel resolveNeed（CLI 分层纪律：编排与呈现，零旁移判卷）；
 * - store 未 init → RESOLVE_FAILED fail-closed（「没查」≠「查了没有」——缺席带路标）；
 * - NO_MATCH 是合法显式输出（exit 0）——解析面不臆造，「设计新」决策归上游；
 * - 命令面钉版：resolve 已注册进程序注册表；README 广告面由
 *   readme-command-surface.spec 双向零漂移钉住（resolve 已入 README 快速上手）。
 */
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore } from "@pomaster/kernel";
import { loadCatalogArchetypes } from "@pomaster/kernel";
import { createProgram, runResolve } from "@pomaster/cli";

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-resolve-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** BOOTSTRAP：向 state/authority.json 登记 owner（幽灵 owner FATAL 的解析源；kernel helpers 同款）。 */
function registerOwner(owner: string): void {
  const path = join(dir, ".pomaster", "state", "authority.json");
  const current = JSON.parse(readFileSync(path, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  current.authorities[owner] = {};
  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`, "utf8");
}

function writeArchetype(id: string, titleZh: string, summaryZh: string): void {
  mkdirSync(join(dir, "catalog", "archetypes"), { recursive: true });
  writeFileSync(
    join(dir, "catalog", "archetypes", `${id.toLowerCase().replaceAll(".", "_")}.json`),
    `${JSON.stringify(
      {
        id,
        kind: "archetype",
        layer: "ARCHETYPE",
        title_zh: titleZh,
        summary_zh: summaryZh,
        composition: { requires: ["ARCHETYPE.BACKEND.CRUD_RESOURCE"], optional: [], incompatible: [] },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function seedPage(id: string, titleZh: string): Promise<void> {
  const store = await createStore(dir);
  registerOwner("BUSINESS_OWNER");
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id,
          kind: "page_surface",
          axisProfile: "page_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh,
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: { surface: "V1" },
        } as never,
      },
    ],
  } as never);
}

describe("runResolve（NOT_CONFIGURED fail-closed 与解析三态）", () => {
  it("store 未 init → RESOLVE_FAILED fail-closed（NOT_CONFIGURED 带 init 路标——缺席≠NO_MATCH）", async () => {
    const outcome = await runResolve({ need: "供应商管理", rootDir: dir });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.message).toContain("store 未初始化");
    expect(outcome.errors[0]?.hint).toContain("pomaster init");
  });

  it("精确腿：在册对象 id → EXACT_MATCH + 人读呈现 match_class（resolve≠采用——零 relations 写入）", async () => {
    await seedPage("PAGE.SUPPLIER_MANAGEMENT", "供应商管理");
    const outcome = await runResolve({ need: "PAGE.SUPPLIER_MANAGEMENT", rootDir: dir });
    expect(outcome.ok).toBe(true);
    expect(outcome.result?.match_class).toBe("EXACT_MATCH");
    expect(outcome.result?.matches[0]?.via).toBe("exact_id");
    expect(outcome.human.join("\n")).toContain("match_class: EXACT_MATCH");
  });

  it("CONFIGURABLE_MATCH：注入 catalog archetype 分母 + required_bindings 聚合 + gate 披露位", async () => {
    await createStore(dir);
    writeArchetype("PAGE_ARCHETYPE.MASTER_DATA", "主数据管理页", "标准件组合");
    const outcome = await runResolve({
      need: "主数据管理页",
      catalogRoot: join(dir, "catalog"),
      rootDir: dir,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result?.match_class).toBe("CONFIGURABLE_MATCH");
    expect(outcome.result?.matches[0]?.domain).toBe("catalog");
    expect(outcome.result?.required_bindings).toEqual(["ARCHETYPE.BACKEND.CRUD_RESOURCE"]);
    expect(outcome.result?.required_gates).toContain("POLICY.GATE.NEW_ENTITY.CHECKS@0.1.0");
  });

  it("NO_MATCH：两分母在场零命中 → ok=true 显式缺席（exit 0 语义；不臆造）", async () => {
    await createStore(dir);
    const outcome = await runResolve({ need: "跨车型成本比较", rootDir: dir });
    expect(outcome.ok).toBe(true);
    expect(outcome.result?.match_class).toBe("NO_MATCH");
    expect(outcome.result?.matches).toEqual([]);
    expect(outcome.result?.sources_examined.catalog_archetypes).toBe(0);
    expect(outcome.human.join("\n")).toContain("NO_MATCH 显式缺席");
  });

  it("loadCatalogArchetypes 经 CLI 注入面可用（opt-in：目录缺失=空数组）", () => {
    expect(loadCatalogArchetypes(join(dir, "absent-catalog"))).toEqual([]);
  });
});

describe("命令面钉版", () => {
  it("resolve 命令已注册进程序注册表（README 广告面由 readme-command-surface 双向钉住）", () => {
    const program = createProgram();
    expect(program.commands.map((command) => command.name())).toContain("resolve");
  });
});
