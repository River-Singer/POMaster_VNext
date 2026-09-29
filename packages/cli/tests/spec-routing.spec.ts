/**
 * spec-routing.spec.ts —— W4 协议路由的 CLI 命令面：applicability 输入扩展
 * （stage/triggers/stack/specRefs）透传、回显、落盘与新鲜度判卷输入恢复。
 *
 * 红线对账：
 * - 协议路由结果只经 catalogEntries 进 REUSE / CATALOG 分区（不进 mustEntries 判卷
 *   输入——§92.2；本 spec 用 repo 空 seed 验证命令面零污染）；
 * - judgeTaskContextFreshness 的输入自恢复必须覆盖 W4 新字段——恢复缺字段会让同输入
 *   重放指纹漂移（fresh 误判 stale_grounding）；
 * - context explain 决策面同输入透传（协议路由解释经 kernel routeSpecs 承载，
 *   CatalogEntryDecision 分母保持 policy/presets 面）。
 */
import { rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Projection, Store } from "@pomaster/kernel";
import { judgeTaskContextFreshness, runInit, runContextCompile, runContextExplain } from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-spec-routing-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function fakeProjection(): Projection {
  return {
    manifest: {
      mustEntries: [],
      advisoryEntries: [],
      catalogEntries: [
        {
          ref: "PROTOCOL.FRONTEND.DATA_GRID",
          reason:
            "spec-routing: .trellis/spec/frontend/30-data-grid-protocol.md（semantic_id=PROTOCOL.FRONTEND.DATA_GRID；命中通道=trigger；source_sha256=sha256:" +
            "3".repeat(64) +
            "）——trigger 词级命中=data-grid；path 仅内容导航不复制正文，机器关系以 semantic_id 承载（W3 stable-reference 预留）——策展面非判卷输入（§92.2）",
        },
      ],
      knowledgeEntries: [],
      lazyTools: [],
    },
    catalogSource: {
      status: "catalog",
      root: "/repo/catalog",
      note: "catalog-lock 校验通过（270 entries）",
    },
    inputsFingerprint: "sha256:" + "b".repeat(64),
  };
}

describe("context compile W4 输入透传与回显", () => {
  it("stage/triggers/stack/specRefs 透传 kernel + applicability 回显含四新键", async () => {
    await runInit(dir);
    const compileProjection = vi.fn(async () => fakeProjection());
    const createStore = vi.fn(async (root: string) => ({ rootDir: root, currentSeq: 0 }) as Store);
    const outcome = await runContextCompile(
      dir,
      "frontend",
      { compileProjection, createStore },
      {
        stage: "implement",
        triggers: ["data-grid", "edit-save"],
        stack: ["vue", "ag-grid"],
        specRefs: ["PROTOCOL.FRONTEND.ACCEPTANCE_GATE"],
      },
    );
    expect(outcome.ok).toBe(true);
    expect(compileProjection.mock.calls[0]?.[1]).toEqual({
      role: "frontend",
      stage: "implement",
      triggers: ["data-grid", "edit-save"],
      stack: ["vue", "ag-grid"],
      specRefs: ["PROTOCOL.FRONTEND.ACCEPTANCE_GATE"],
    });
    expect(outcome.result.applicability).toEqual({
      change: null,
      capabilities: [],
      change_class: null,
      stage: "implement",
      triggers: ["data-grid", "edit-save"],
      stack: ["vue", "ag-grid"],
      spec_refs: ["PROTOCOL.FRONTEND.ACCEPTANCE_GATE"],
    });
    // markdown applicability 行携带 W4 输入（人读面）。
    expect(outcome.result.markdown).toContain("stage=implement");
    expect(outcome.result.markdown).toContain("triggers=data-grid/edit-save");
    expect(outcome.result.markdown).toContain("stack=vue/ag-grid");
    expect(outcome.result.markdown).toContain("spec_refs=PROTOCOL.FRONTEND.ACCEPTANCE_GATE");
  });

  it("落盘 manifest applicability 携 W4 新键（重放判卷输入自恢复的数据面）", async () => {
    await runInit(dir);
    const outcome = await runContextCompile(dir, "frontend", undefined, {
      stage: "verify",
      triggers: ["test"],
      stack: ["vue"],
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.persisted).toBe(true);
    const { readFileSync } = await import("node:fs");
    const persisted = JSON.parse(
      readFileSync(`${dir}/.pomaster/state/contexts/frontend.context.json`, "utf8"),
    ) as Record<string, unknown>;
    expect(persisted["applicability"]).toMatchObject({
      stage: "verify",
      triggers: ["test"],
      stack: ["vue"],
      spec_refs: [],
    });
  });

  it("无 W4 输入时回显缺省（null/空数组）且 markdown 零新增行段", async () => {
    await runInit(dir);
    const outcome = await runContextCompile(dir, "frontend");
    expect(outcome.result.applicability).toEqual({
      change: null,
      capabilities: [],
      change_class: null,
      stage: null,
      triggers: [],
      stack: [],
      spec_refs: [],
    });
    expect(outcome.result.markdown).not.toContain("applicability:");
  });
});

describe("judgeTaskContextFreshness W4 输入恢复（审计 N5 同源判卷）", () => {
  it("落盘后按恢复的 W4 输入重编译 → fresh（恢复缺字段会误判 stale——本用例红即恢复缺陷）", async () => {
    await runInit(dir);
    const first = await runContextCompile(dir, "frontend", undefined, {
      change: "CHANGE.C9001",
      stage: "implement",
      triggers: ["data-grid"],
      stack: ["vue", "ag-grid"],
      specRefs: [],
    });
    expect(first.ok).toBe(true);
    expect(first.result.stale_check.state).toBe("absent");
    const judgment = await judgeTaskContextFreshness(dir, "CHANGE.C9001");
    expect(judgment.state).toBe("fresh");
  });
});

describe("context explain W4 输入透传", () => {
  it("stage/triggers/stack/specRefs 透传 explainCatalogProjection（决策面同输入）", async () => {
    await runInit(dir);
    const explainCatalogProjection = vi.fn(async () => ({
      inputs: {
        role: "frontend",
        taskRef: null,
        capabilities: [],
        changeClass: null,
      },
      decisions: [],
      catalogSource: {
        status: "catalog" as const,
        root: "/repo/catalog",
        note: "catalog-lock 校验通过（270 entries）",
      },
    }));
    const createStore = vi.fn(async (root: string) => ({ rootDir: root, currentSeq: 0 }) as Store);
    const outcome = await runContextExplain(
      dir,
      "frontend",
      { explainCatalogProjection, createStore },
      {
        stage: "implement",
        triggers: ["data-grid"],
        stack: ["vue"],
        specRefs: ["PROTOCOL.FRONTEND.ACCEPTANCE_GATE"],
      },
    );
    expect(outcome.ok).toBe(true);
    expect(explainCatalogProjection.mock.calls[0]?.[1]).toEqual({
      role: "frontend",
      stage: "implement",
      triggers: ["data-grid"],
      stack: ["vue"],
      specRefs: ["PROTOCOL.FRONTEND.ACCEPTANCE_GATE"],
    });
  });
});
