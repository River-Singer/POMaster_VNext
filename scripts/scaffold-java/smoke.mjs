#!/usr/bin/env node
// 脚手架后端实证（CI 的 scaffold-java 任务）第二步：在真实 MySQL 上跑迁移、起两个应用、按规格走一遍接口。
//
// 用法：node scripts/scaffold-java/smoke.mjs <项目目录>
// 前提：MySQL 8 在 127.0.0.1:3306（root / root）；后端已 mvn package；项目由 generate.mjs 生成。
//
// 账号与生产同一口径：迁移账号只做结构变更（Flyway），两个应用账号只有 grants.sql 授的数据权限。
import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "");
const manifest = JSON.parse(readFileSync(join(root, ".pomaster", "scaffold", "generation-manifest.json"), "utf8"));
const spec = manifest.spec_snapshot;
const app = spec.app.key;
const schema = app.replace(/-/g, "_");
const ENV = app.replace(/-/g, "_").toUpperCase();
const backend = join(root, "backend");
const PASSWORD = { migrator: "Migrator-pw-1", admin: "Admin-pw-1", public: "Public-pw-1" };
const PORTS = { admin: 18080, public: 18090 };
const MANAGEMENT = { admin: 8081, public: 8082 };

let failures = 0;
function check(condition, label, detail = "") {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === "" ? "" : ` — ${detail}`}`);
  }
}

function run(command, args, input) {
  const result = spawnSync(command, args, { input, encoding: "utf8", stdio: [input === undefined ? "ignore" : "pipe", "inherit", "inherit"] });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} 失败（exit ${result.status}）`);
}

function mysql(sql, database = "") {
  run("mysql", ["-h127.0.0.1", "-P3306", "-uroot", "-proot", ...(database === "" ? [] : [database])], sql);
}

// ── 库与账号（grants.sql 的占位符按 CI 环境替换） ──
console.log(`[${app}] schema ${schema}`);
mysql(
  [
    `CREATE DATABASE IF NOT EXISTS \`${schema}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`,
    ...Object.entries(PASSWORD).map(([role, password]) => `CREATE USER IF NOT EXISTS '${schema}_${role}'@'%' IDENTIFIED BY '${password}';`),
  ].join("\n"),
);
// 表级授权要等表建好：先只授迁移账号，迁移后再执行整份授权脚本。
const grants = readFileSync(join(backend, "db", "grants.sql"), "utf8")
  .replaceAll("${schema}", schema)
  .replace(/\$\{[a-z]+_host\}/g, "%");
mysql(grants.split("\n").filter((line) => line.startsWith("GRANT") && line.includes("_migrator'")).join("\n"));

// ── 迁移（迁移账号） ──
const jdbc = `jdbc:mysql://127.0.0.1:3306/${schema}?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true`;
run("mvn", [
  "-B",
  "-ntp",
  "-q",
  "-f",
  join(backend, "pom.xml"),
  "-pl",
  `${app}-core`,
  "flyway:migrate",
  `-Dflyway.url=${jdbc}`,
  `-Dflyway.user=${schema}_migrator`,
  `-Dflyway.password=${PASSWORD.migrator}`,
]);
mysql(grants);
console.log(`[${app}] migrated, app accounts granted`);

// ── 起应用 ──
const FIELD_KEY = Buffer.alloc(32, 7).toString("base64");
const processes = [];
function start(surface) {
  const module = `${app}-${surface}-api`;
  const dir = join(backend, module, "target");
  const jar = readdirSync(dir).find((name) => name.endsWith(".jar") && !name.endsWith("-plain.jar"));
  if (jar === undefined) throw new Error(`没有找到 ${module} 的可执行 jar`);
  const log = join(dir, "smoke.log");
  const out = openSync(log, "w");
  const child = spawn("java", ["-jar", join(dir, jar)], {
    stdio: ["ignore", out, out],
    env: {
      ...process.env,
      [`${ENV}_DB_URL`]: jdbc,
      [`${ENV}_${surface.toUpperCase()}_DB_USERNAME`]: `${schema}_${surface}`,
      [`${ENV}_${surface.toUpperCase()}_DB_PASSWORD`]: PASSWORD[surface],
      [`${ENV}_${surface.toUpperCase()}_PORT`]: String(PORTS[surface]),
      [`${ENV}_FIELD_KEY`]: FIELD_KEY,
    },
  });
  closeSync(out);
  processes.push({ child, log, surface });
}

async function waitHealthy(surface) {
  const url = `http://127.0.0.1:${MANAGEMENT[surface]}/actuator/health`;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok && (await response.json()).status === "UP") return;
    } catch {
      // 还没起来
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`${surface} 应用 90 秒内没有就绪（${url}）`);
}

function stopAll() {
  for (const { child } of processes) child.kill("SIGTERM");
}

function dumpLogs() {
  for (const { log, surface } of processes) {
    console.log(`──── ${surface} log (tail) ────`);
    console.log(readFileSync(log, "utf8").split("\n").slice(-80).join("\n"));
  }
}

const BASE = { admin: `http://127.0.0.1:${PORTS.admin}${spec.surfaces.admin?.base_path ?? ""}`, public: `http://127.0.0.1:${PORTS.public}${spec.surfaces.public?.base_path ?? ""}` };

async function call(surface, method, path, { body, actor, headers = {} } = {}) {
  const response = await fetch(`${BASE[surface]}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(actor === undefined ? {} : { "X-Test-Actor": actor }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, headers: response.headers, json, text };
}

function allPermissions(entity) {
  const codes = Object.values(spec.entities.find((candidate) => candidate.key === entity).exposure.admin.permission_codes);
  return `ops-1||${codes.join(",")}`;
}

function isProblem(response, status, code) {
  return (
    response.status === status &&
    (response.headers.get("content-type") ?? "").startsWith("application/problem+json") &&
    response.json?.status === status &&
    response.json?.code === code &&
    typeof response.json?.trace_id === "string"
  );
}

async function fleetScenario() {
  const ADMIN = allPermissions("vehicle_model");
  const model = (code, status = "ENABLED") => ({
    businessCode: code,
    name: `车型 ${code}`,
    status,
    seats: 5,
    listPrice: "199999.5",
    costPrice: "150000",
    description: "说明",
  });

  console.log("[fleet] 管理侧");
  check(isProblem(await call("admin", "GET", "/vehicle-models"), 401, "UNAUTHENTICATED"), "没登录 → 401 problem+json，带 trace_id");
  check(isProblem(await call("admin", "GET", "/vehicle-models", { actor: "ops-2||fleet:vehicle_model:get" }), 403, "FORBIDDEN"), "没有列表权限码 → 403");
  const created = await call("admin", "POST", "/vehicle-models", { body: model("CAR-001"), actor: ADMIN });
  check(created.status === 201, "新建 → 201", created.text);
  check((created.headers.get("location") ?? "").endsWith(`/vehicle-models/${created.json?.id}`), "Location 指向新记录");
  check(created.json?.listPrice === "199999.50" && created.json?.version === 0 && created.json?.createdBy === "ops-1", "decimal 按精度回字符串、version 从 0 开始、创建人取操作者", created.text);
  check(/Z$/.test(created.json?.createdAt ?? ""), "时间带 UTC 偏移", created.json?.createdAt);
  const duplicate = await call("admin", "POST", "/vehicle-models", { body: model("CAR-001"), actor: ADMIN });
  check(isProblem(duplicate, 409, "DUPLICATE_VALUE") && duplicate.json?.field_errors?.[0]?.pointer === "/businessCode", "唯一值冲突 → 409 + 字段 pointer", duplicate.text);
  const invalid = await call("admin", "POST", "/vehicle-models", { body: { ...model("CAR-X"), seats: 0, name: "" }, actor: ADMIN });
  const pointers = (invalid.json?.field_errors ?? []).map((item) => item.pointer).sort();
  check(isProblem(invalid, 400, "VALIDATION_FAILED") && pointers.includes("/seats") && pointers.includes("/name"), "校验失败 → 400 + 字段级错误", invalid.text);
  check(isProblem(await call("admin", "POST", "/vehicle-models", { body: { ...model("CAR-Y"), extra: 1 }, actor: ADMIN }), 400, "MALFORMED_REQUEST"), "未知字段 → 400");
  check(isProblem(await call("admin", "POST", "/vehicle-models", { body: { ...model("CAR-Z"), status: "BROKEN" }, actor: ADMIN }), 400, "MALFORMED_REQUEST"), "枚举值不在取值里 → 400");
  const list = await call("admin", "GET", "/vehicle-models?page=1&size=20", { actor: ADMIN });
  check(list.status === 200 && list.json?.total === 1 && list.json?.items?.length === 1 && list.json?.hasMore === false, "OFFSET 列表带总数", list.text);
  check(list.headers.get("cache-control") === "no-store", "管理侧响应 no-store", list.headers.get("cache-control"));
  check(isProblem(await call("admin", "GET", "/vehicle-models?size=500", { actor: ADMIN }), 400, "VALIDATION_FAILED"), "页长超上限 → 400");
  const id = created.json?.id;
  const updated = await call("admin", "PUT", `/vehicle-models/${id}`, { body: { ...model("CAR-001"), name: "改名", description: null, version: 0 }, actor: ADMIN });
  check(updated.status === 200 && updated.json?.version === 1 && updated.json?.name === "改名" && updated.json?.description === null, "修改 → version + 1，可空字段能清空", updated.text);
  check(isProblem(await call("admin", "PUT", `/vehicle-models/${id}`, { body: { ...model("CAR-001"), version: 0 }, actor: ADMIN }), 409, "VERSION_CONFLICT"), "带旧 version 修改 → 409");
  await call("admin", "POST", "/vehicle-models", { body: model("CAR-OFF", "DISABLED"), actor: ADMIN });
  for (const code of ["CAR-002", "CAR-003", "CAR-004"]) await call("admin", "POST", "/vehicle-models", { body: model(code), actor: ADMIN });
  const prefix = await call("admin", "GET", "/vehicle-models?businessCode=CAR-00", { actor: ADMIN });
  check(prefix.json?.total === 4, "字符串前缀检索", prefix.text);
  const escaped = await call("admin", "GET", "/vehicle-models?businessCode=CAR%25", { actor: ADMIN });
  check(escaped.json?.total === 0, "检索值里的 % 按字面匹配", escaped.text);

  console.log("[fleet] 用户侧");
  const page1 = await call("public", "GET", "/vehicle-models?limit=2");
  check(page1.status === 200 && page1.json?.items?.length === 2 && page1.json?.hasMore === true && typeof page1.json?.nextCursor === "string", "匿名 KEYSET 第一页", page1.text);
  check(!("total" in (page1.json ?? {})), "用户侧不返回总数");
  check(page1.json?.items?.every((item) => !("costPrice" in item) && !("status" in item) && !("createdBy" in item)), "只出现对用户侧暴露的字段", page1.text);
  check(/public/.test(page1.headers.get("cache-control") ?? "") && /max-age=60/.test(page1.headers.get("cache-control") ?? ""), "匿名读可缓存", page1.headers.get("cache-control"));
  const etag = page1.headers.get("etag");
  check(typeof etag === "string" && etag.length > 0, "带 ETag");
  if (etag !== null) check((await call("public", "GET", "/vehicle-models?limit=2", { headers: { "If-None-Match": etag } })).status === 304, "If-None-Match 命中 → 304");
  const page2 = await call("public", "GET", `/vehicle-models?limit=2&after=${encodeURIComponent(page1.json?.nextCursor ?? "")}`);
  const codes = [...(page1.json?.items ?? []), ...(page2.json?.items ?? [])].map((item) => item.businessCode);
  check(JSON.stringify(codes) === JSON.stringify(["CAR-001", "CAR-002", "CAR-003", "CAR-004"]) && page2.json?.hasMore === false, "翻页按排序键接续、不重不漏、不含停用的", JSON.stringify(codes));
  check(isProblem(await call("public", "GET", "/vehicle-models?after=garbage"), 400, "INVALID_CURSOR"), "坏游标 → 400");
  const disabledId = (await call("admin", "GET", "/vehicle-models?businessCode=CAR-OFF", { actor: ADMIN })).json?.items?.[0]?.id;
  check(isProblem(await call("public", "GET", `/vehicle-models/${disabledId}`), 404, "NOT_FOUND"), "停用的车型对用户侧不可见 → 404");
  check((await call("public", "GET", `/vehicle-models/${id}`)).json?.name === "改名", "用户侧单条读取");
  check((await call("public", "DELETE", `/vehicle-models/${id}`)).status === 405, "用户侧没有删除接口");

  console.log("[fleet] 删除");
  check(isProblem(await call("admin", "DELETE", `/vehicle-models/${id}?version=0`, { actor: ADMIN }), 409, "VERSION_CONFLICT"), "带旧 version 删除 → 409");
  check((await call("admin", "DELETE", `/vehicle-models/${id}?version=1`, { actor: ADMIN })).status === 204, "删除 → 204");
  check(isProblem(await call("admin", "GET", `/vehicle-models/${id}`, { actor: ADMIN }), 404, "NOT_FOUND"), "删除后 → 404");
}

async function shopScenario() {
  const U1 = "user-1|101|";
  const U2 = "user-2|102|";
  const ADMIN = allPermissions("customer_address");
  const address = (label, extra = {}) => ({ label, receiver: "张三丰", phone: "13800001111", birthday: "1990-01-02", isDefault: false, kind: "HOME", visits: 1, lastUsedAt: "2026-11-01T08:00:00+08:00", ...extra });

  console.log("[shop] 用户侧属主档");
  check(isProblem(await call("public", "GET", "/customer-addresses"), 401, "UNAUTHENTICATED"), "属主档没登录 → 401");
  const created = await call("public", "POST", "/customer-addresses", { body: address("b"), actor: U1 });
  check(created.status === 201 && created.json?.phone === "13800001111" && created.json?.receiver === "张三丰", "本人新建并读回明文", created.text);
  check(created.json?.lastUsedAt === "2026-11-01T00:00:00Z", "时间换算成 UTC 存取", created.json?.lastUsedAt);
  check(created.headers.get("cache-control") === "private, no-store", "属主数据不缓存", created.headers.get("cache-control"));
  const id = created.json?.id;
  check(isProblem(await call("public", "GET", `/customer-addresses/${id}`, { actor: U2 }), 404, "NOT_FOUND"), "别人的记录 → 404");
  check((await call("public", "GET", "/customer-addresses", { actor: U2 })).json?.items?.length === 0, "列表只含本人的记录");
  for (const label of [null, "a", "c"]) await call("public", "POST", "/customer-addresses", { body: address(label), actor: U1 });
  const seen = [];
  let after = "";
  for (let guard = 0; guard < 10; guard += 1) {
    const page = await call("public", "GET", `/customer-addresses?limit=1${after === "" ? "" : `&after=${encodeURIComponent(after)}`}`, { actor: U1 });
    seen.push(...(page.json?.items ?? []).map((item) => item.label));
    if (page.json?.hasMore !== true) break;
    after = page.json.nextCursor;
  }
  check(JSON.stringify(seen) === JSON.stringify(["c", "b", "a", null]), "可空排序键降序翻页：空值段在最后、不重不漏", JSON.stringify(seen));

  console.log("[shop] 管理侧脱敏与加密");
  const viewed = await call("admin", "GET", `/customer-addresses/${id}`, { actor: ADMIN });
  check(viewed.status === 200 && viewed.json?.receiver === "张**" && viewed.json?.phone === "138*****111", "管理侧个人信息脱敏", viewed.text);
  const echo = await call("admin", "PUT", `/customer-addresses/${id}`, { body: { ...address("b2"), receiver: viewed.json?.receiver, phone: viewed.json?.phone, version: viewed.json?.version }, actor: ADMIN });
  check(echo.status === 200 && echo.json?.label === "b2", "管理侧带脱敏回显值修改", echo.text);
  const own = await call("public", "GET", `/customer-addresses/${id}`, { actor: U1 });
  check(own.json?.phone === "13800001111" && own.json?.receiver === "张三丰", "提交脱敏回显值视为没改，原值保留", own.text);
  const raw = spawnSync("mysql", ["-h127.0.0.1", "-uroot", "-proot", "-N", "-e", `SELECT LENGTH(phone), HEX(phone) FROM \`${schema}\`.customer_address WHERE id = ${Number(id)}`], { encoding: "utf8" });
  const [length, hex] = raw.stdout.trim().split(/\s+/);
  check(Number(length) === 12 + 11 + 16 && !hex.includes(Buffer.from("13800001111").toString("hex").toUpperCase()), "库里存的是 AES-GCM 密文（IV + 密文 + 标签）", raw.stdout);

  console.log("[shop] 登录档与匿名档");
  check(isProblem(await call("public", "GET", "/notices"), 401, "UNAUTHENTICATED"), "登录档没登录 → 401");
  check((await call("public", "GET", "/notices", { actor: U2 })).status === 200, "登录档登录后可读");
  check((await call("public", "GET", "/tags")).status === 200, "匿名档可读");
  const notice = await call("admin", "POST", "/notices", { body: { title: "开业", publishedOn: null, body: "正文", weight: 1 }, actor: allPermissions("notice") });
  check(notice.status === 201, "管理侧新建公告", notice.text);
}

const scenarios = { fleet: fleetScenario, "shop-ops": shopScenario };
const scenario = scenarios[app];
if (scenario === undefined) throw new Error(`没有 ${app} 的冒烟剧本`);

try {
  for (const surface of ["admin", "public"]) if (spec.surfaces[surface] !== undefined) start(surface);
  for (const { surface } of processes) await waitHealthy(surface);
  console.log(`[${app}] apps up`);
  await scenario();
} catch (error) {
  failures += 1;
  console.log(`  FAIL ${error instanceof Error ? error.message : String(error)}`);
} finally {
  if (failures > 0) dumpLogs();
  stopAll();
}
console.log(`[${app}] ${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
