/**
 * scaffold-openapi.ts —— 接口层模板集 `openapi-3.1`（脚手架 S1-5）。
 *
 * 纯函数：归一化规格 → 每个部署面一份 OpenAPI 3.1 文档（JSON，确定性键序）。落盘、记账、
 * KEYBINDING 登记归 scaffold-generate.ts；一致性判卷（checkOpenApiConformance）归 scaffold-check.ts。
 *
 * 形态来自 catalog 原型卡，不在模板里另立规则：
 * - ARCHETYPE.API.RESOURCE：集合读取 / 单体读取 / 新建 / 修改 / 移除，绑定授权、错误、分页、校验；
 * - ARCHETYPE.API.PAGINATION：管理侧 OFFSET（page / size，总数按实体开启），用户侧 KEYSET
 *   （after 游标 + limit，不返回总数），页长有界，稳定排序；
 * - ARCHETYPE.API.ERROR：RFC 9457 problem+json 五个标准成员 + 扩展成员 code / trace_id / field_errors。
 *
 * 两个面的差异（scaffold-surfaces.ts）：管理侧每个操作标权限码（x-pomaster-permission）、
 * 响应 Cache-Control: no-store；用户侧标访问档（x-pomaster-access）、匿名读带 Cache-Control + ETag、
 * 只出现规格里用户侧暴露的字段；两侧都有 429。认证方式是项目决策位（D-S5），文档不声明
 * securitySchemes，只标授权结构。
 *
 * JSON 约定：DTO 属性 camelCase；decimal 用字符串（避免浏览器端浮点丢精度）；可空字段用 3.1 的
 * type 数组表示。
 */
import type {
  NormalizedDomainSpec,
  NormalizedEntity,
  NormalizedField,
} from "./scaffold-spec.js";
import { SURFACE_PROFILES, type ScaffoldSurfaceKey } from "./scaffold-surfaces.js";

export const OPENAPI_TEMPLATE_SET = { id: "openapi-3.1", version: "1" } as const;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

export function openApiPath(surface: ScaffoldSurfaceKey): string {
  return `api/openapi/${surface}.openapi.json`;
}

// ============================================================
// 命名
// ============================================================

const VERB: Readonly<Record<string, string>> = {
  list: "List",
  get: "Get",
  create: "Create",
  update: "Update",
  delete: "Delete",
};

export function operationId(surface: ScaffoldSurfaceKey, operation: string, entity: NormalizedEntity): string {
  return `${surface}${VERB[operation] ?? operation}${entity.class_name}`;
}

function dtoName(surface: ScaffoldSurfaceKey, entity: NormalizedEntity): string {
  return surface === "admin" ? `${entity.class_name}` : `Public${entity.class_name}`;
}

/** 某个面某个实体的预期 operationId 集合（判卷与生成同一来源）。 */
export function expectedOperationIds(spec: NormalizedDomainSpec, surface: ScaffoldSurfaceKey): string[] {
  const ids: string[] = [];
  for (const entity of spec.entities) {
    for (const operation of entity.exposure[surface]?.operations ?? []) ids.push(operationId(surface, operation, entity));
  }
  return ids;
}

// ============================================================
// 字段 → JSON Schema
// ============================================================

function decimalPattern(field: NormalizedField): string {
  const integerDigits = Math.max(1, (field.precision ?? 1) - (field.scale ?? 0));
  const scale = field.scale ?? 0;
  return scale === 0 ? `^-?\\d{1,${integerDigits}}$` : `^-?\\d{1,${integerDigits}}(\\.\\d{1,${scale}})?$`;
}

function baseSchema(field: NormalizedField): JsonObject {
  switch (field.type) {
    case "string": {
      const out: JsonObject = { type: "string", maxLength: field.length ?? 0 };
      return out;
    }
    case "text":
      return { type: "string" };
    case "int":
    case "long": {
      const out: JsonObject = { type: "integer", format: field.type === "int" ? "int32" : "int64" };
      if (field.range?.min !== undefined) out["minimum"] = field.range.min;
      if (field.range?.max !== undefined) out["maximum"] = field.range.max;
      return out;
    }
    case "decimal": {
      const out: JsonObject = { type: "string", format: "decimal", pattern: decimalPattern(field) };
      if (field.range?.min !== undefined) out["x-minimum"] = String(field.range.min);
      if (field.range?.max !== undefined) out["x-maximum"] = String(field.range.max);
      return out;
    }
    case "bool":
      return { type: "boolean" };
    case "date":
      return { type: "string", format: "date" };
    case "datetime":
      return { type: "string", format: "date-time" };
    case "enum":
      return {
        type: "string",
        enum: (field.values ?? []).map((value) => value.key),
        "x-enum-labels": Object.fromEntries((field.values ?? []).map((value) => [value.key, value.name_zh])),
      };
    default:
      throw new Error(`scaffold-openapi: 未知字段类型 ${String(field.type)}`);
  }
}

const SYSTEM_SCHEMAS: Readonly<Record<string, JsonObject>> = {
  id: { type: "integer", format: "int64", readOnly: true },
  owner_id: { type: "integer", format: "int64", readOnly: true },
  created_at: { type: "string", format: "date-time", readOnly: true },
  created_by: { type: "string", readOnly: true },
  updated_at: { type: "string", format: "date-time", readOnly: true },
  updated_by: { type: "string", readOnly: true },
  version: { type: "integer", format: "int32", minimum: 0, description: "乐观锁版本：修改 / 删除时原样带回，不一致返回 409" },
};

/** 业务字段的响应 / 请求属性；非必填字段可空（3.1 type 数组）。 */
function fieldSchema(field: NormalizedField, surface: ScaffoldSurfaceKey, nullable: boolean): JsonObject {
  const schema = baseSchema(field);
  const out: JsonObject = { ...schema, title: field.name_zh };
  if (nullable && typeof schema["type"] === "string") out["type"] = [schema["type"], "null"];
  if (field.classification !== "public" && field.classification !== "internal") {
    out["x-pomaster-classification"] = field.classification;
    if (surface === "admin") {
      out["description"] = "个人信息：管理侧默认脱敏显示，查看明文需单独权限并留严格审计";
    }
  }
  return out;
}

// ============================================================
// 组件
// ============================================================

function problemSchema(): JsonObject {
  return {
    type: "object",
    description: "RFC 9457 问题详情（ARCHETYPE.API.ERROR）：五个标准成员 + 扩展成员；客户端必须忽略不认识的扩展成员",
    properties: {
      type: { type: "string", format: "uri-reference", default: "about:blank" },
      title: { type: "string" },
      status: { type: "integer", description: "必须与真实 HTTP 状态码一致" },
      detail: { type: "string" },
      instance: { type: "string", format: "uri-reference" },
      code: { type: "string", description: "扩展成员：业务错误码" },
      trace_id: { type: "string", description: "扩展成员：链路追踪 id" },
      field_errors: {
        type: "array",
        description: "扩展成员：字段级错误",
        items: {
          type: "object",
          required: ["detail", "pointer"],
          properties: { detail: { type: "string" }, pointer: { type: "string", description: "JSON Pointer，指向出错字段" } },
        },
      },
    },
    required: ["title", "status"],
  };
}

function problemResponse(description: string, extraHeaders: JsonObject = {}): JsonObject {
  const out: JsonObject = {
    description,
    content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
  };
  if (Object.keys(extraHeaders).length > 0) out["headers"] = extraHeaders;
  return out;
}

function commonResponses(): JsonObject {
  return {
    BadRequest: problemResponse("请求不合法（字段级错误见 field_errors）"),
    Unauthorized: problemResponse("未认证（认证方式由项目决定）"),
    Forbidden: problemResponse("已认证但没有该操作的权限码"),
    NotFound: problemResponse("记录不存在、不可见或不属于当前用户"),
    Conflict: problemResponse("版本冲突（乐观锁）或唯一约束冲突"),
    TooManyRequests: problemResponse("超出限流", {
      "Retry-After": { description: "多少秒后可重试", schema: { type: "integer", minimum: 0 } },
    }),
  };
}

function ref(name: string): JsonObject {
  return { $ref: `#/components/schemas/${name}` };
}

function responseRef(name: string): JsonObject {
  return { $ref: `#/components/responses/${name}` };
}

function exposedBusinessFields(entity: NormalizedEntity, surface: ScaffoldSurfaceKey): NormalizedField[] {
  const keys = entity.exposure[surface]?.fields ?? [];
  return entity.fields.filter((field) => !field.system && keys.includes(field.key));
}

function systemField(entity: NormalizedEntity, key: string): NormalizedField | undefined {
  return entity.fields.find((field) => field.system && field.key === key);
}

/** 响应 DTO：管理侧含系统列；用户侧只含 id（有写操作时含 version）。 */
function dtoSchema(entity: NormalizedEntity, surface: ScaffoldSurfaceKey): JsonObject {
  const properties: JsonObject = {};
  const required: string[] = [];
  const idField = systemField(entity, "id");
  if (idField !== undefined) {
    properties[idField.property] = SYSTEM_SCHEMAS["id"] ?? {};
    required.push(idField.property);
  }
  for (const field of exposedBusinessFields(entity, surface)) {
    properties[field.property] = fieldSchema(field, surface, !field.required);
    if (field.required) required.push(field.property);
  }
  const operations = entity.exposure[surface]?.operations ?? [];
  const systemKeys =
    surface === "admin"
      ? ["owner_id", "created_at", "created_by", "updated_at", "updated_by", "version"]
      : operations.some((op) => op === "update" || op === "delete")
        ? ["version"]
        : [];
  for (const key of systemKeys) {
    const field = systemField(entity, key);
    if (field === undefined) continue;
    properties[field.property] = SYSTEM_SCHEMAS[key] ?? {};
    required.push(field.property);
  }
  return { type: "object", title: entity.name_zh, properties, required };
}

function writeSchema(entity: NormalizedEntity, surface: ScaffoldSurfaceKey, withVersion: boolean): JsonObject {
  const properties: JsonObject = {};
  const required: string[] = [];
  for (const field of exposedBusinessFields(entity, surface)) {
    properties[field.property] = fieldSchema(field, surface, !field.required);
    if (field.required) required.push(field.property);
  }
  if (withVersion) {
    const version = systemField(entity, "version");
    if (version !== undefined) {
      properties[version.property] = { type: "integer", format: "int32", minimum: 0, description: "读到的版本号原样带回" };
      required.push(version.property);
    }
  }
  return { type: "object", additionalProperties: false, properties, required };
}

function pageSchema(entity: NormalizedEntity, surface: ScaffoldSurfaceKey): JsonObject {
  const items = { type: "array", items: ref(dtoName(surface, entity)) };
  if (surface === "admin") {
    const properties: JsonObject = {
      items,
      page: { type: "integer", minimum: 1 },
      size: { type: "integer", minimum: 1 },
      hasMore: { type: "boolean" },
    };
    const required = ["items", "page", "size", "hasMore"];
    if (entity.exposure.admin?.count_total === true) {
      properties["total"] = { type: "integer", format: "int64", minimum: 0 };
      required.push("total");
    }
    return { type: "object", properties, required };
  }
  return {
    type: "object",
    description: "KEYSET 分页：不返回总数；hasMore 为 true 时用 nextCursor 取下一页",
    properties: {
      items,
      nextCursor: { type: ["string", "null"], description: "不透明游标" },
      hasMore: { type: "boolean" },
    },
    required: ["items", "nextCursor", "hasMore"],
  };
}

// ============================================================
// 路径与操作
// ============================================================

function filterParameters(entity: NormalizedEntity, surface: ScaffoldSurfaceKey): JsonObject[] {
  const params: JsonObject[] = [];
  for (const field of exposedBusinessFields(entity, surface)) {
    if (!field.searchable) continue;
    const schema = baseSchema(field);
    delete schema["x-enum-labels"];
    params.push({
      name: field.property,
      in: "query",
      required: false,
      description: field.type === "string" ? `${field.name_zh}（前缀匹配）` : `${field.name_zh}（精确匹配）`,
      schema,
    });
  }
  return params;
}

function paginationParameters(surface: ScaffoldSurfaceKey): JsonObject[] {
  const profile = SURFACE_PROFILES[surface];
  if (surface === "admin") {
    return [
      { name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
      {
        name: "size",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: profile.abuse.max_page_size, default: profile.pagination.default_page_size },
      },
    ];
  }
  return [
    { name: "after", in: "query", required: false, description: "上一页返回的 nextCursor", schema: { type: "string" } },
    {
      name: "limit",
      in: "query",
      required: false,
      schema: { type: "integer", minimum: 1, maximum: profile.abuse.max_page_size, default: profile.pagination.default_page_size },
    },
  ];
}

function successHeaders(entity: NormalizedEntity, surface: ScaffoldSurfaceKey, read: boolean): JsonObject {
  if (surface === "admin") {
    return { "Cache-Control": { description: "管理侧接口默认不缓存", schema: { type: "string", const: "no-store" } } };
  }
  if (read && entity.exposure.public?.access === "anonymous") {
    return {
      "Cache-Control": { description: "匿名公开读可被 CDN / 浏览器缓存", schema: { type: "string" } },
      ETag: { description: "内容实体标签，配合 If-None-Match 返回 304", schema: { type: "string" } },
    };
  }
  return { "Cache-Control": { schema: { type: "string", const: "private, no-store" } } };
}

function errorResponses(entity: NormalizedEntity, surface: ScaffoldSurfaceKey, codes: readonly string[]): JsonObject {
  const access = entity.exposure.public?.access;
  const out: JsonObject = {};
  for (const code of codes) {
    if (code === "401" && surface === "public" && access === "anonymous") continue;
    if (code === "403" && surface === "public") continue;
    const name = { "400": "BadRequest", "401": "Unauthorized", "403": "Forbidden", "404": "NotFound", "409": "Conflict", "429": "TooManyRequests" }[code];
    if (name !== undefined) out[code] = responseRef(name);
  }
  return out;
}

function operationMeta(entity: NormalizedEntity, surface: ScaffoldSurfaceKey, operation: string): JsonObject {
  const meta: JsonObject = {
    operationId: operationId(surface, operation, entity),
    tags: [entity.name_zh],
    "x-pomaster-entity": entity.key,
  };
  if (surface === "admin") {
    meta["x-pomaster-permission"] = entity.exposure.admin?.permission_codes[operation] ?? null;
  } else {
    meta["x-pomaster-access"] = entity.exposure.public?.access ?? null;
  }
  return meta;
}

function idParameter(): JsonObject {
  return { name: "id", in: "path", required: true, schema: { type: "integer", format: "int64" } };
}

function json(schema: JsonObject): JsonObject {
  return { "application/json": { schema } };
}

function renderPaths(entity: NormalizedEntity, surface: ScaffoldSurfaceKey): [string, JsonObject][] {
  const operations = entity.exposure[surface]?.operations ?? [];
  const collection: JsonObject = {};
  const item: JsonObject = {};
  const dto = dtoName(surface, entity);
  const has = (op: string): boolean => operations.includes(op);
  const visibility =
    surface === "public" && entity.exposure.public?.visible_when !== null && entity.exposure.public?.visible_when !== undefined
      ? `只返回 ${entity.exposure.public.visible_when.field} ∈ {${entity.exposure.public.visible_when.in.join(", ")}} 的记录。`
      : "";
  const ownerNote = surface === "public" && entity.exposure.public?.access === "owner" ? "只涉及当前用户自己的记录。" : "";

  if (has("list")) {
    collection["get"] = {
      ...operationMeta(entity, surface, "list"),
      summary: `${entity.name_zh}列表`,
      description: `${surface === "admin" ? "OFFSET 分页（page / size）" : "KEYSET 分页（after / limit），不返回总数"}；默认排序 ${entity.default_sort.field} ${entity.default_sort.direction}。${visibility}${ownerNote}`,
      parameters: [...paginationParameters(surface), ...filterParameters(entity, surface)],
      responses: {
        "200": { description: "一页记录", headers: successHeaders(entity, surface, true), content: json(ref(`${dto}Page`)) },
        ...errorResponses(entity, surface, ["400", "401", "403", "429"]),
      },
    };
  }
  if (has("create")) {
    collection["post"] = {
      ...operationMeta(entity, surface, "create"),
      summary: `新建${entity.name_zh}`,
      ...(ownerNote.length > 0 ? { description: `${ownerNote}属主由服务端设为当前用户。` } : {}),
      requestBody: { required: true, content: json(ref(`${dto}CreateRequest`)) },
      responses: {
        "201": {
          description: "已创建",
          headers: { Location: { description: "新记录地址", schema: { type: "string" } } },
          content: json(ref(dto)),
        },
        ...errorResponses(entity, surface, ["400", "401", "403", "409", "429"]),
      },
    };
  }
  const itemParams = [idParameter()];
  if (has("get")) {
    item["get"] = {
      ...operationMeta(entity, surface, "get"),
      summary: `${entity.name_zh}详情`,
      ...(visibility.length + ownerNote.length > 0 ? { description: `${visibility}${ownerNote}不满足时返回 404。` } : {}),
      parameters: itemParams,
      responses: {
        "200": { description: "记录", headers: successHeaders(entity, surface, true), content: json(ref(dto)) },
        ...errorResponses(entity, surface, ["401", "403", "404", "429"]),
      },
    };
  }
  if (has("update")) {
    item["put"] = {
      ...operationMeta(entity, surface, "update"),
      summary: `修改${entity.name_zh}`,
      description: `${ownerNote}请求体带回读到的 version；版本不一致返回 409。`,
      parameters: itemParams,
      requestBody: { required: true, content: json(ref(`${dto}UpdateRequest`)) },
      responses: {
        "200": { description: "已修改", headers: successHeaders(entity, surface, false), content: json(ref(dto)) },
        ...errorResponses(entity, surface, ["400", "401", "403", "404", "409", "429"]),
      },
    };
  }
  if (has("delete")) {
    item["delete"] = {
      ...operationMeta(entity, surface, "delete"),
      summary: `删除${entity.name_zh}`,
      description: `${ownerNote}带上读到的 version；版本不一致返回 409。`,
      parameters: [
        ...itemParams,
        { name: "version", in: "query", required: true, schema: { type: "integer", format: "int32", minimum: 0 } },
      ],
      responses: {
        "204": { description: "已删除" },
        ...errorResponses(entity, surface, ["401", "403", "404", "409", "429"]),
      },
    };
  }
  const out: [string, JsonObject][] = [];
  if (Object.keys(collection).length > 0) out.push([`/${entity.resource}`, collection]);
  if (Object.keys(item).length > 0) out.push([`/${entity.resource}/{id}`, item]);
  return out;
}

/** 渲染某个面的 OpenAPI 文档；该面没有暴露实体时返回 null。 */
export function renderOpenApi(spec: NormalizedDomainSpec, surface: ScaffoldSurfaceKey): string | null {
  const declared = spec.surfaces[surface];
  const entities = spec.entities.filter((entity) => entity.exposure[surface] !== undefined);
  if (declared === undefined || entities.length === 0) return null;
  const profile = SURFACE_PROFILES[surface];
  const version = /\/(v\d+)$/.exec(declared.base_path)?.[1] ?? "v1";

  const paths: JsonObject = {};
  const schemas: JsonObject = { Problem: problemSchema() };
  for (const entity of entities) {
    for (const [path, item] of renderPaths(entity, surface)) paths[path] = item;
    const dto = dtoName(surface, entity);
    const operations = entity.exposure[surface]?.operations ?? [];
    schemas[dto] = dtoSchema(entity, surface);
    if (operations.includes("list")) schemas[`${dto}Page`] = pageSchema(entity, surface);
    if (operations.includes("create")) schemas[`${dto}CreateRequest`] = writeSchema(entity, surface, false);
    if (operations.includes("update")) schemas[`${dto}UpdateRequest`] = writeSchema(entity, surface, true);
  }

  const doc: JsonObject = {
    openapi: "3.1.0",
    info: {
      title: `${spec.app.name_zh}（${profile.title_zh}）`,
      version,
      description: `由 pomaster scaffold generate 生成（模板集 ${OPENAPI_TEMPLATE_SET.id}@${OPENAPI_TEMPLATE_SET.version}）。受管文件，不要手改：改 .pomaster/scaffold/domain-spec.yaml → pomaster scaffold confirm --change → pomaster scaffold generate。认证方式由项目决定，本文档只标授权结构。`,
      "x-pomaster-surface": surface,
      "x-pomaster-app": spec.app.key,
    },
    servers: [{ url: declared.base_path, description: profile.title_zh }],
    paths,
    components: { schemas, responses: commonResponses() },
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// ============================================================
// 一致性判卷（不依赖生成器：从规格独立推出约束，逐条对照文档）
// ============================================================

/**
 * 对照规格检查某个面的 OpenAPI 文档，返回问题清单（空 = 一致）：
 * - operationId 集合与规格暴露的操作一一对应（多出 = 规格外接口，少了 = 缺接口）；
 * - 用户侧文档的组件里不得出现规格未对用户侧暴露的业务字段（OWASP API3）；
 * - 管理侧每个操作都标了权限码，用户侧每个操作都标了访问档。
 */
export function checkOpenApiConformance(spec: NormalizedDomainSpec, surface: ScaffoldSurfaceKey, text: string): string[] {
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return ["不是合法 JSON"];
  }
  const problems: string[] = [];
  const expected = new Set(expectedOperationIds(spec, surface));
  const actual = new Set<string>();
  const paths = (doc["paths"] ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
  for (const [path, item] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(item ?? {})) {
      const id = operation?.["operationId"];
      if (typeof id !== "string") {
        problems.push(`${method.toUpperCase()} ${path} 没有 operationId`);
        continue;
      }
      actual.add(id);
      if (surface === "admin" && typeof operation["x-pomaster-permission"] !== "string") {
        problems.push(`${id} 没有标权限码`);
      }
      if (surface === "public" && typeof operation["x-pomaster-access"] !== "string") {
        problems.push(`${id} 没有标访问档`);
      }
    }
  }
  for (const id of actual) if (!expected.has(id)) problems.push(`规格外的接口：${id}`);
  for (const id of expected) if (!actual.has(id)) problems.push(`缺少接口：${id}`);

  if (surface === "public") {
    const allowed = new Set<string>();
    const forbidden = new Map<string, string>();
    for (const entity of spec.entities) {
      const exposedKeys = entity.exposure.public?.fields ?? [];
      for (const field of entity.fields) {
        if (field.system) continue;
        if (exposedKeys.includes(field.key)) allowed.add(field.property);
        else forbidden.set(field.property, `${entity.key}.${field.key}`);
      }
    }
    const schemas = ((doc["components"] as Record<string, unknown> | undefined)?.["schemas"] ?? {}) as Record<string, Record<string, unknown>>;
    for (const [name, schema] of Object.entries(schemas)) {
      if (name === "Problem" || name.endsWith("Page")) continue; // 分页包装与错误信封不是业务 DTO
      const properties = (schema?.["properties"] ?? {}) as Record<string, unknown>;
      for (const property of Object.keys(properties)) {
        const origin = forbidden.get(property);
        if (origin !== undefined && !allowed.has(property)) {
          problems.push(`用户侧文档 ${name} 出现未对用户侧暴露的字段 ${property}（${origin}）`);
        }
      }
    }
  }
  return problems;
}
