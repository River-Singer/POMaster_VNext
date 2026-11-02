/**
 * scaffold-openapi.spec.ts —— 接口层模板集 openapi-3.1（11-01-storybook-scaffold S1-5）。
 *
 * 判据：
 * - 每个部署面一份 OpenAPI 3.1 文档；样例规格的两份文档与金样逐字节一致；
 * - 结构自洽：$ref 全部可解析、required ⊆ properties、operationId 唯一、路径参数已声明、
 *   组件 schema 能被 JSON Schema 2020-12 编译；
 * - 原型卡形态：管理侧 OFFSET + 权限码 + no-store；用户侧 KEYSET（不返回总数）+ 访问档 +
 *   匿名读缓存头；两侧 problem+json（RFC 9457 五个标准成员 + code / trace_id / field_errors）与 429；
 *   文档不声明认证方式（项目决策位）；
 * - 用户侧只出现规格对用户侧暴露的字段；属主档的写操作带 version、不出现 403；
 * - 一致性判卷独立于生成器：手改文档（加内部字段、加 / 删接口、去掉权限码）逐条检出。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { loadCatalogArchetypes, resolveCatalogRoot } from "@pomaster/kernel";
import {
  checkOpenApiConformance,
  expectedOperationIds,
  renderOpenApi,
  validateDomainSpec,
  type NormalizedDomainSpec,
} from "@pomaster/cli";

const SAMPLE_PATH = fileURLToPath(new URL("../scaffold/examples/fleet.domain-spec.yaml", import.meta.url));
const GOLDEN = (name: string): string => readFileSync(fileURLToPath(new URL(`./golden/scaffold/${name}`, import.meta.url)), "utf8");
const CATALOG = loadCatalogArchetypes(resolveCatalogRoot()).map((material) => ({ id: material.id, operations: material.operations }));

// 规格与 OpenAPI 文档是动态 JSON 结构，测试里按路径读写，用 any 最直接。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;

function sampleRaw(): Doc {
  return loadYaml(readFileSync(SAMPLE_PATH, "utf8")) as Doc;
}

function normalize(raw: unknown): NormalizedDomainSpec {
  const result = validateDomainSpec(raw, CATALOG);
  if (!result.ok || result.spec === null) throw new Error(JSON.stringify(result.issues.map((issue) => issue.code)));
  return result.spec;
}

function render(spec: NormalizedDomainSpec, surface: "admin" | "public"): Doc {
  const text = renderOpenApi(spec, surface);
  if (text === null) throw new Error(`no ${surface} document`);
  return JSON.parse(text) as Doc;
}

const HTTP_METHODS = ["get", "put", "post", "delete", "patch"];

function operations(doc: Doc): Doc[] {
  const out: Doc[] = [];
  for (const [path, item] of Object.entries(doc["paths"] as Doc)) {
    for (const method of HTTP_METHODS) {
      if (item[method] !== undefined) out.push({ path, method, ...item[method] });
    }
  }
  return out;
}

/** 文档内全部 $ref 都能解析。 */
function unresolvedRefs(doc: Doc): string[] {
  const missing: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Doc)) {
      if (key === "$ref" && typeof value === "string") {
        const target = value
          .replace(/^#\//, "")
          .split("/")
          .reduce<unknown>((current, segment) => (current as Doc | undefined)?.[segment], doc);
        if (target === undefined) missing.push(value);
      } else {
        walk(value);
      }
    }
  };
  walk(doc);
  return missing;
}

/** 每个 object schema 的 required 都在 properties 里。 */
function requiredOutsideProperties(doc: Doc): string[] {
  const problems: string[] = [];
  const walk = (node: unknown, where: string): void => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${where}[${index}]`));
      return;
    }
    if (node === null || typeof node !== "object") return;
    const record = node as Doc;
    if (Array.isArray(record["required"]) && record["properties"] !== undefined) {
      for (const name of record["required"] as string[]) {
        if (!(name in (record["properties"] as Doc))) problems.push(`${where}: ${name}`);
      }
    }
    for (const [key, value] of Object.entries(record)) walk(value, `${where}.${key}`);
  };
  walk(doc, "$");
  return problems;
}

describe("样例规格的两份文档", () => {
  const spec = normalize(sampleRaw());

  it("与金样逐字节一致", () => {
    expect(renderOpenApi(spec, "admin")).toBe(GOLDEN("admin.openapi.json"));
    expect(renderOpenApi(spec, "public")).toBe(GOLDEN("public.openapi.json"));
  });

  for (const surface of ["admin", "public"] as const) {
    it(`${surface}：OpenAPI 3.1、$ref 全可解析、required ⊆ properties、operationId 唯一、路径参数已声明`, () => {
      const doc = render(spec, surface);
      expect(doc["openapi"]).toBe("3.1.0");
      expect(unresolvedRefs(doc)).toEqual([]);
      expect(requiredOutsideProperties(doc)).toEqual([]);
      const ids = operations(doc).map((operation) => operation["operationId"]);
      expect(new Set(ids).size).toBe(ids.length);
      expect([...ids].sort()).toEqual([...expectedOperationIds(spec, surface)].sort());
      for (const operation of operations(doc)) {
        const pathParams = [...String(operation["path"]).matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
        const declared = ((operation["parameters"] ?? []) as Doc[]).filter((param) => param["in"] === "path").map((param) => param["name"]);
        expect(declared.sort(), `${operation["operationId"]}`).toEqual(pathParams.sort());
        for (const response of Object.values(operation["responses"] as Doc)) {
          expect(typeof response["description"] === "string" || typeof response["$ref"] === "string").toBe(true);
        }
      }
      expect(doc["components"]["securitySchemes"]).toBeUndefined(); // 认证方式是项目决策位
    });

    it(`${surface}：组件 schema 能被 JSON Schema 2020-12 编译`, () => {
      const doc = render(spec, surface);
      const ajv = new Ajv2020({ strict: false, validateFormats: false });
      const defs = JSON.parse(JSON.stringify(doc["components"]["schemas"]).replaceAll("#/components/schemas/", "#/$defs/")) as Doc;
      for (const name of Object.keys(defs)) {
        expect(() => ajv.compile({ $defs: defs, $ref: `#/$defs/${name}` }), name).not.toThrow();
      }
    });
  }

  it("管理侧：五操作带权限码；OFFSET（page / size ≤ 200）+ 总数；响应不缓存；每个操作有 401 / 403 / 429", () => {
    const doc = render(spec, "admin");
    for (const operation of operations(doc)) {
      expect(operation["x-pomaster-permission"]).toMatch(/^fleet:vehicle_model:(list|get|create|update|delete)$/);
      expect(Object.keys(operation["responses"])).toEqual(expect.arrayContaining(["401", "403", "429"]));
    }
    const list = doc["paths"]["/vehicle-models"]["get"];
    expect(list["parameters"].slice(0, 2)).toEqual([
      { name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
      { name: "size", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200, default: 20 } },
    ]);
    expect(list["responses"]["200"]["headers"]["Cache-Control"]["schema"]["const"]).toBe("no-store");
    expect(doc["components"]["schemas"]["VehicleModelPage"]["required"]).toContain("total");
    expect(doc["components"]["schemas"]["VehicleModelUpdateRequest"]["required"]).toContain("version");
    expect(doc["paths"]["/vehicle-models/{id}"]["delete"]["parameters"].map((param: Doc) => param["name"])).toEqual(["id", "version"]);
  });

  it("用户侧：匿名只读、KEYSET（after / limit ≤ 50，不返回总数）、缓存头；只出现用户侧暴露的字段", () => {
    const doc = render(spec, "public");
    expect(Object.keys(doc["paths"])).toEqual(["/vehicle-models", "/vehicle-models/{id}"]);
    const list = doc["paths"]["/vehicle-models"]["get"];
    expect(list["x-pomaster-access"]).toBe("anonymous");
    expect(list["parameters"].map((param: Doc) => param["name"])).toEqual(["after", "limit", "businessCode", "name"]);
    expect(list["parameters"][1]["schema"]["maximum"]).toBe(50);
    expect(Object.keys(list["responses"])).toEqual(["200", "400", "429"]);
    expect(Object.keys(list["responses"]["200"]["headers"])).toEqual(["Cache-Control", "ETag"]);
    const page = doc["components"]["schemas"]["PublicVehicleModelPage"];
    expect(page["required"]).toEqual(["items", "nextCursor", "hasMore"]);
    expect(page["properties"]["total"]).toBeUndefined();
    const dto = doc["components"]["schemas"]["PublicVehicleModel"];
    expect(Object.keys(dto["properties"])).toEqual(["id", "businessCode", "name", "seats", "listPrice", "description"]);
    expect(JSON.stringify(doc)).not.toContain("costPrice");
    expect(JSON.stringify(doc)).not.toContain("createdBy");
  });

  it("类型映射：decimal 为带精度 pattern 的字符串；可空字段用 3.1 type 数组；枚举带中文标签", () => {
    const admin = render(spec, "admin")["components"]["schemas"]["VehicleModel"]["properties"];
    expect(admin["listPrice"]).toMatchObject({ type: ["string", "null"], format: "decimal", pattern: "^-?\\d{1,10}(\\.\\d{1,2})?$" });
    expect(admin["seats"]).toMatchObject({ type: ["integer", "null"], format: "int32", minimum: 1, maximum: 99 });
    expect(admin["status"]).toMatchObject({ type: "string", enum: ["ENABLED", "DISABLED"], "x-enum-labels": { ENABLED: "启用", DISABLED: "停用" } });
    expect(admin["version"]).toMatchObject({ type: "integer" });
  });

  it("问题详情：RFC 9457 五个标准成员 + 扩展成员 code / trace_id / field_errors（ARCHETYPE.API.ERROR）", () => {
    const problem = render(spec, "public")["components"]["schemas"]["Problem"]["properties"];
    expect(Object.keys(problem)).toEqual(["type", "title", "status", "detail", "instance", "code", "trace_id", "field_errors"]);
    const notFound = render(spec, "admin")["components"]["responses"]["NotFound"];
    expect(Object.keys(notFound["content"])).toEqual(["application/problem+json"]);
  });
});

describe("属主档与只有一个面的规格", () => {
  function ownedSpec(): NormalizedDomainSpec {
    return normalize({
      schema: "pomaster.domain-spec/v1",
      app: { key: "fleet", name_zh: "车队管理", java_package: "com.example.fleet" },
      surfaces: { admin: {}, public: {} },
      entities: [
        {
          key: "driver_profile",
          name_zh: "司机档案",
          ownership: "user",
          archetypes: { data: "DATA_ARCHETYPE.MASTER_DATA", backend: "ARCHETYPE.BACKEND.CRUD_RESOURCE" },
          fields: [
            { key: "business_code", name_zh: "档案编号", type: "string", length: 32, required: true, unique: true },
            { key: "name", name_zh: "姓名", type: "string", length: 32, required: true, classification: "pii" },
            { key: "status", name_zh: "状态", type: "enum", required: true, values: [{ key: "ACTIVE", name_zh: "在职" }] },
            { key: "mobile", name_zh: "手机号", type: "string", length: 20, classification: "pii" },
          ],
          exposure: {
            admin: { operations: ["get", "list", "update"] },
            public: { operations: ["get", "update"], access: "owner", fields: ["name", "mobile"] },
          },
        },
      ],
    });
  }

  it("用户侧属主档：写操作带 version、有 401 无 403、说明只涉及本人；个人信息字段带分级扩展", () => {
    const doc = render(ownedSpec(), "public");
    const put = doc["paths"]["/driver-profiles/{id}"]["put"];
    expect(put["x-pomaster-access"]).toBe("owner");
    expect(put["description"]).toContain("当前用户自己的记录");
    expect(Object.keys(put["responses"])).toContain("401");
    expect(Object.keys(put["responses"])).not.toContain("403");
    expect(doc["components"]["schemas"]["PublicDriverProfile"]["required"]).toContain("version");
    expect(doc["components"]["schemas"]["PublicDriverProfile"]["properties"]["mobile"]["x-pomaster-classification"]).toBe("pii");
    expect(doc["paths"]["/driver-profiles"]).toBeUndefined(); // 没有 list / create
  });

  it("管理侧个人信息字段说明默认脱敏；属主列 ownerId 只读出现", () => {
    const schema = render(ownedSpec(), "admin")["components"]["schemas"]["DriverProfile"]["properties"];
    expect(schema["mobile"]["description"]).toContain("脱敏");
    expect(schema["ownerId"]).toMatchObject({ readOnly: true });
  });

  it("只有管理侧暴露 → 用户侧不出文档", () => {
    const raw = sampleRaw();
    delete raw["entities"][0]["exposure"]["public"];
    expect(renderOpenApi(normalize(raw), "public")).toBeNull();
  });
});

describe("一致性判卷：独立于生成器检出手改", () => {
  const spec = normalize(sampleRaw());

  it("原样文档 → 无问题", () => {
    for (const surface of ["admin", "public"] as const) {
      expect(checkOpenApiConformance(spec, surface, renderOpenApi(spec, surface) ?? "")).toEqual([]);
    }
  });

  it("用户侧 DTO 塞进内部字段 → 检出", () => {
    const doc = render(spec, "public");
    doc["components"]["schemas"]["PublicVehicleModel"]["properties"]["costPrice"] = { type: "string" };
    expect(checkOpenApiConformance(spec, "public", JSON.stringify(doc))).toEqual([
      "用户侧文档 PublicVehicleModel 出现未对用户侧暴露的字段 costPrice（vehicle_model.cost_price）",
    ]);
  });

  it("多出规格外的接口 / 少了规格里的接口 → 检出", () => {
    const doc = render(spec, "public");
    doc["paths"]["/vehicle-models"]["post"] = { operationId: "publicCreateVehicleModel", "x-pomaster-access": "anonymous", responses: {} };
    delete doc["paths"]["/vehicle-models/{id}"];
    expect(checkOpenApiConformance(spec, "public", JSON.stringify(doc))).toEqual([
      "规格外的接口：publicCreateVehicleModel",
      "缺少接口：publicGetVehicleModel",
    ]);
  });

  it("管理侧操作去掉权限码 / 没有 operationId → 检出", () => {
    const doc = render(spec, "admin");
    delete doc["paths"]["/vehicle-models"]["post"]["x-pomaster-permission"];
    delete doc["paths"]["/vehicle-models/{id}"]["delete"]["operationId"];
    expect(checkOpenApiConformance(spec, "admin", JSON.stringify(doc))).toEqual([
      "adminCreateVehicleModel 没有标权限码",
      "DELETE /vehicle-models/{id} 没有 operationId",
      "缺少接口：adminDeleteVehicleModel",
    ]);
  });

  it("不是 JSON → 检出", () => {
    expect(checkOpenApiConformance(spec, "admin", "openapi: 3.1.0")).toEqual(["不是合法 JSON"]);
  });
});
