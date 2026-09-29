/**
 * spec-routing-fixtures.ts —— W4 协议路由测试共享 fixture（纯 helper 零 describe 注册
 * ——跨 spec import 无套件副作用；装载面词形校验由 spec-routing.spec.ts 承担，本文件
 * 的 pureManifest 走对象直构，routeSpecs 纯函数单测/验收零 IO）。
 *
 * MASTer 边界：AG Grid 协议条目只以 overlay fixture 存在（项目特例不进 universal seed）。
 */
import type { SpecRoutingEntry, SpecRoutingManifest } from "@pomaster/kernel";

/** sha256 词形 fixture 简写（tag 中非 hex 字符剥除——sha256 词形要求 64 hex）。 */
export function sha(tag: string): string {
  return `sha256:${tag.replace(/[^0-9a-f]/g, "").padEnd(64, "0").slice(0, 64)}`;
}

/**
 * AG Grid overlay 演示分母（12 条；布局：2 always 基线 + verify-only 验收 + 6 frontend
 * implement 协议（grid/form/data-model/api/testing/mock）+ 1 backend stack 协议 +
 * 1 退役条目 + 1 无关条目）。requires 链：REQUEST_API→DATA_MODEL、MOCK→TESTING。
 */
export function routingFixtureEntries(): Record<string, unknown>[] {
  const p = (n: string): string => `.trellis/spec/frontend/${n}`;
  return [
    { semantic_id: "PROTOCOL.FRONTEND.DEV_CHECKLIST", path: p("01-development-checklist-protocol.md"), always: true, source_sha256: sha("01") },
    { semantic_id: "PROTOCOL.FRONTEND.AI_CODE", path: p("02-ai-generated-code-protocol.md"), always: true, source_sha256: sha("02") },
    { semantic_id: "PROTOCOL.FRONTEND.ACCEPTANCE_GATE", path: p("03-acceptance-gate-protocol.md"), stage: ["verify"], source_sha256: sha("03") },
    {
      semantic_id: "PROTOCOL.FRONTEND.DATA_GRID",
      path: p("30-data-grid-protocol.md"),
      stage: ["implement"],
      triggers: ["data-grid", "ag-grid", "editable-grid"],
      stack: ["vue", "ag-grid"],
      source_sha256: sha("30"),
    },
    {
      semantic_id: "PROTOCOL.FRONTEND.FORM",
      path: p("28-form-protocol.md"),
      stage: ["implement"],
      triggers: ["form", "editable-grid", "edit-save"],
      stack: ["vue"],
      source_sha256: sha("28"),
    },
    {
      semantic_id: "PROTOCOL.FRONTEND.DATA_MODEL",
      path: p("14-data-model-protocol.md"),
      stage: ["implement"],
      triggers: ["data-model", "field", "edit-save"],
      source_sha256: sha("14"),
    },
    {
      semantic_id: "PROTOCOL.FRONTEND.REQUEST_API",
      path: p("15-request-api-protocol.md"),
      stage: ["implement"],
      triggers: ["api", "save", "put"],
      requires: ["PROTOCOL.FRONTEND.DATA_MODEL"],
      source_sha256: sha("15"),
    },
    {
      semantic_id: "PROTOCOL.FRONTEND.TESTING",
      path: p("20-testing-protocol.md"),
      stage: ["implement", "verify"],
      triggers: ["test", "vitest"],
      source_sha256: sha("20"),
    },
    {
      semantic_id: "PROTOCOL.FRONTEND.MOCK",
      path: p("35-mock-protocol.md"),
      stage: ["implement"],
      triggers: ["mock", "edit-save"],
      requires: ["PROTOCOL.FRONTEND.TESTING"],
      source_sha256: sha("35"),
    },
    {
      semantic_id: "PROTOCOL.BACKEND.REQUEST_API",
      path: ".trellis/spec/backend/request-api-protocol.md",
      stage: ["implement"],
      triggers: ["api", "save"],
      stack: ["fastapi"],
      source_sha256: sha("be15"),
    },
    {
      semantic_id: "PROTOCOL.FRONTEND.OLD_GRID",
      path: p("30-data-grid-protocol.v1.md"),
      superseded_by: "PROTOCOL.FRONTEND.DATA_GRID",
      source_sha256: sha("30v1"),
    },
    {
      semantic_id: "PROTOCOL.FRONTEND.THEME",
      path: p("22-theme-protocol.md"),
      stage: ["implement"],
      triggers: ["theme", "dark-mode"],
      source_sha256: sha("22"),
    },
  ];
}

/**
 * 对象直构 manifest（零 IO；最小形状检查防 fixture 明显坏形——语义校验归装载面测试）。
 * 缺席字段按 W4.1 定稿的诚实缺省补齐（与 loadSpecRoutingManifest 同缺省词形）。
 */
export function pureManifest(
  entries: Record<string, unknown>[] = routingFixtureEntries(),
): SpecRoutingManifest {
  return {
    schema: "pomaster.spec-routing/1",
    profile: "project-overlay",
    entries: entries.map((raw): SpecRoutingEntry => {
      const record = raw as Partial<SpecRoutingEntry> & Record<string, unknown>;
      if (typeof record.semantic_id !== "string" || typeof record.path !== "string") {
        throw new Error(`fixture 坏形（缺 semantic_id/path）: ${String(record.semantic_id)}`);
      }
      if (
        typeof record.source_sha256 !== "string" ||
        !/^sha256:[0-9a-f]{64}$/.test(record.source_sha256)
      ) {
        throw new Error(`fixture 坏形（source_sha256 词形）: ${record.semantic_id}`);
      }
      return {
        semantic_id: record.semantic_id,
        path: record.path,
        stage: record.stage ?? [],
        triggers: record.triggers ?? [],
        stack: record.stack ?? [],
        always: record.always ?? false,
        superseded_by: record.superseded_by ?? null,
        requires: record.requires ?? [],
        conflicts: record.conflicts ?? [],
        source_sha256: record.source_sha256,
        note: record.note ?? null,
      };
    }),
  };
}
