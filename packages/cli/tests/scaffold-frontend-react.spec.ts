/**
 * scaffold-frontend-react.spec.ts —— 管理侧前端的 React 模板集（react-geist-admin@1）与按技术栈选模板。
 *
 * 判据：
 * - 每个管理侧实体生成接口客户端 + 查询 hooks、列表页、编辑对话框与模块入口（有新建或修改时）、路由描述、文案；公共文件各一份；
 * - 生成物照 Geist 规范写：用 Geist 预设跑 `design check`，全部检查零违规；
 * - 按 React 栈的前端架构写：组件只经 hooks 取数、路由懒加载并在 handle 声明权限码、表单用 react-hook-form + zod、
 *   地址栏的枚举筛选只认规格取值；没有任何 Vue / ant-design-vue 的写法；
 * - 选模板：Vue → vue-antd-admin，React → react-geist-admin，技术栈没定或别的组合 → 不生成并说明原因。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCatalogArchetypes, resolveCatalogRoot } from "@pomaster/kernel";
import {
  assessDesignStandard,
  chooseFrontendTemplateFromStack,
  renderAdminFrontendReact,
  validateDomainSpec,
  type NormalizedDomainSpec,
} from "@pomaster/cli";

const SAMPLE_PATH = fileURLToPath(new URL("../scaffold/examples/fleet.domain-spec.yaml", import.meta.url));
const CATALOG = loadCatalogArchetypes(resolveCatalogRoot()).map((material) => ({ id: material.id, operations: material.operations }));
const ROOT = "frontend/admin/src";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function sampleRaw(): Raw {
  return loadYaml(readFileSync(SAMPLE_PATH, "utf8")) as Raw;
}

function normalize(raw: Raw): NormalizedDomainSpec {
  const result = validateDomainSpec(raw, CATALOG);
  if (!result.ok || result.spec === null) throw new Error(JSON.stringify(result.issues.slice(0, 3)));
  return result.spec;
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "scaffold-frontend-react-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeAll(spec: NormalizedDomainSpec): Map<string, string> {
  const files = new Map<string, string>();
  for (const file of renderAdminFrontendReact(spec)) {
    const target = join(dir, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content, "utf8");
    files.set(file.path, file.content);
  }
  return files;
}

describe("React 管理侧前端生成（react-geist-admin@1）", () => {
  it("每个实体：接口客户端与 hooks、列表页、编辑对话框与模块入口、路由描述、文案；公共文件各一份", () => {
    const files = renderAdminFrontendReact(normalize(sampleRaw()));
    expect(files.map((file) => [file.path, file.template]).sort()).toEqual(
      [
        [`${ROOT}/api/http.ts`, "react.admin.http"],
        [`${ROOT}/lib/format.ts`, "react.admin.format"],
        [`${ROOT}/lib/permission.ts`, "react.admin.permission"],
        [`${ROOT}/lib/i18n.ts`, "react.admin.i18n"],
        [`${ROOT}/lib/url-state.ts`, "react.admin.url-state"],
        [`${ROOT}/locales/zh-CN/index.ts`, "react.admin.locale-index"],
        [`${ROOT}/routes/scaffold.ts`, "react.admin.routes-index"],
        [`${ROOT}/locales/zh-CN/vehicle-model.ts`, "react.admin.locale"],
        [`${ROOT}/api/vehicle-model.ts`, "react.admin.api"],
        [`${ROOT}/routes/vehicle-model/list.tsx`, "react.admin.list"],
        [`${ROOT}/routes/vehicle-model/route.ts`, "react.admin.routes"],
        [`${ROOT}/features/vehicle-model/VehicleModelEditDialog.tsx`, "react.admin.form"],
        [`${ROOT}/features/vehicle-model/index.ts`, "react.admin.feature-index"],
      ].sort(),
    );
    const segments = files.map((file) => file.keybindingSegment);
    expect(new Set(segments).size).toBe(segments.length);
  });

  it("生成物用 Geist 预设跑 design check：全部检查零违规", () => {
    writeAll(normalize(sampleRaw()));
    const report = assessDesignStandard(dir, { roots: [ROOT], system: "geist" });
    expect(report.applicable).toBe(true);
    expect(report.design_system).toBe("geist");
    expect(report.files).toBeGreaterThanOrEqual(13);
    expect(report.findings.map((finding) => `${finding.check} ${finding.file}:${finding.line} ${finding.message}`)).toEqual([]);
    expect(report.violations).toBe(0);
  });

  it("按 React 栈的前端架构写：hooks 取数、懒加载路由带 handle、react-hook-form + zod、URL 枚举只认规格取值；没有 Vue 写法", () => {
    const files = writeAll(normalize(sampleRaw()));
    const all = [...files.values()].join("\n");
    expect(all).not.toMatch(/ant-design-vue|from "vue"|vue-router|vue-i18n|<template>|v-model/);
    const api = files.get(`${ROOT}/api/vehicle-model.ts`)!;
    expect(api).toContain('from "@tanstack/react-query"');
    expect(api).toContain("export function useVehicleModelList(");
    expect(api).toContain("invalidateQueries({ queryKey: vehicleModelKeys.all })");
    const list = files.get(`${ROOT}/routes/vehicle-model/list.tsx`)!;
    expect(list).not.toMatch(/(?<![\w.])fetch\s*\(|axios/);
    expect(list).toContain("useVehicleModelList(query)");
    expect(list).toContain("status: oneOf(params.get(\"status\"), STATUS_VALUES)");
    expect(list).toContain('from "@/features/vehicle-model"');
    expect(list).not.toContain("@/features/vehicle-model/");
    const route = files.get(`${ROOT}/routes/vehicle-model/route.ts`)!;
    expect(route).toContain('load: () => import("./list")');
    expect(route).toContain('handle: { auth: true, permission: "fleet:vehicle_model:list"');
    const form = files.get(`${ROOT}/features/vehicle-model/VehicleModelEditDialog.tsx`)!;
    expect(form).toContain("zodResolver(schema)");
    expect(form).toContain("setError(item.field as keyof Values");
    expect(form).toContain("version: record.version");
    expect(form).toMatch(/listPrice: z\.string\(\)\.regex\(\/\^-\?\\d\{1,10\}\(\\\.\\d\{1,2\}\)\?\$\//);
    const locale = files.get(`${ROOT}/locales/zh-CN/vehicle-model.ts`)!;
    expect(locale).toContain('pageOf: "第 {page} 页"');
    expect(locale).toContain("decimalFormat");
  });

  it("只读实体不生成编辑对话框与模块入口；只对用户侧暴露的实体不生成管理侧前端", () => {
    const readonly = sampleRaw();
    readonly["entities"][0]["exposure"]["admin"]["operations"] = ["list", "get"];
    const files = renderAdminFrontendReact(normalize(readonly));
    expect(files.some((file) => file.template === "react.admin.form" || file.template === "react.admin.feature-index")).toBe(false);
    const list = files.find((file) => file.template === "react.admin.list")!.content;
    expect(list).not.toContain("EditDialog");
    expect(list).not.toContain("useRemove");
    const publicOnly = sampleRaw();
    delete publicOnly["entities"][0]["exposure"]["admin"];
    delete publicOnly["entities"][0]["archetypes"]["page"];
    delete publicOnly["surfaces"]["admin"];
    expect(renderAdminFrontendReact(normalize(publicOnly))).toEqual([]);
  });
});

describe("按技术栈选前端模板集", () => {
  it("Vue → vue-antd；React → react-geist；ui 已选但不配套 → 不生成；技术栈没定 / 别的框架 → 不生成并说明", () => {
    expect(chooseFrontendTemplateFromStack("vue3", "antdesign").kind).toBe("vue-antd");
    expect(chooseFrontendTemplateFromStack("vue3", "UNKNOWN").kind).toBe("vue-antd");
    expect(chooseFrontendTemplateFromStack("react", "geist").kind).toBe("react-geist");
    expect(chooseFrontendTemplateFromStack("react", "shadcn/ui").kind).toBe("react-geist");
    expect(chooseFrontendTemplateFromStack("react", "UNKNOWN").kind).toBe("react-geist");
    const reactAntd = chooseFrontendTemplateFromStack("react", "antdesign");
    expect(reactAntd.kind).toBe("none");
    if (reactAntd.kind === "none") expect(reactAntd.reason_zh).toContain("antdesign");
    expect(chooseFrontendTemplateFromStack("vue3", "element-plus").kind).toBe("none");
    expect(chooseFrontendTemplateFromStack("angular", "UNKNOWN").kind).toBe("none");
    const undecided = chooseFrontendTemplateFromStack("UNKNOWN", "UNKNOWN");
    expect(undecided.kind).toBe("none");
    if (undecided.kind === "none") expect(undecided.hint).toContain("pomaster baseline set frontend framework");
    expect(chooseFrontendTemplateFromStack(null, null).kind).toBe("none");
  });
});
