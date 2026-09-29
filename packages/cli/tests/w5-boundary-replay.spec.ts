/**
 * w5-boundary-replay.spec.ts —— W5 Case E/F 边界回放（FR-09/FR10；AC-12/AC-13；
 * W0 promotion-audit R3/R4 行逐字；契约 w5-probe-contract §5/§6）。
 *
 * ═══ fixture 分层声明（契约 §5）═══
 * 本文件全部 fixture kind=node_http_service：真实 TCP loopback socket（node:http
 * createServer listen(0)）+ 真实文件系统持久化（tmpdir 写盘/重读）+ server 端
 * project_id 过滤——可重现事故根因（server 端 list 过滤/持久化语义）；
 * real_browser 腿仅在义务声明 visible_via=ui_surface 且工具在座时要求（缺席=NOT_RUN
 * 诚实呈现，见 plan-runner.spec W5 describe 的 ui_surface 用例）——本文件不冒充
 * 真实业务链之外的证明范围。
 *
 * ═══ Case E（R3：mock/real mutation 分裂——坑点汇编 M:54-56）═══
 * 注入：mock 腿 import 落库（真实写盘）、real 腿仅解析（响应 shape 相同、不落库）。
 * 红=seam 比较器 mutation_outcome 维度分歧（persisted=true ≠ false——shape 对称不
 * 证明副作用对称）；双腿语义一致（real 腿补落库）后绿。
 * ═══ Case F（R4：保存 200 但 scope 不可见——坑点汇编 M:41-44）═══
 * 注入：write 200 且落库成功，但 server 端写盘丢 project_id（scope 绑定缺失）→
 * list 按 project_id 过滤查不到 → visible_result=false（HTTP 200 ≠ 用户可见）。
 * 红=oracle 声明链 visible 段不可见（w5_oracle_visible_chain_incomplete）；修复
 * scope 绑定后 request→persist→re_read→mapping→visible 全链绿（visible_via=api_list）。
 *
 * 红线锚：不重造 runtime runner（走 runBindingGate/GRN 管线）；副作用门不放宽
 * （INTERACTIVE_REVERSIBLE=隔离 fixture+cleanup_ref+cleanup 证据）；失败注入红在
 * 目标断言（seam 维度分歧 / visible 段不可见），非 CLI/环境崩溃。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, beginExecution, createStore } from "@pomaster/kernel";
import type { ToolBindingRecord } from "@pomaster/gauntlet-lite";
import { runInit, runPlanRun } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-w5-replay-"));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

/**
 * fixture 分层声明（契约 §5 闭合词形 {kind, proves, does_not_prove}）：Node http
 * 真服务+真持久化文件证明范围显式呈现——Node 文件沙箱不得改名冒充真实业务链。
 */
const W5_HTTP_FIXTURE_DECLARATION = {
  kind: "node_http_service",
  proves: [
    "真实 TCP loopback socket 请求/响应（node:http listen(0)）",
    "真实文件系统持久化与重读（tmpdir 写盘/读回）",
    "server 端 project_id 过滤的可见性语义（Case F 事故根因层）",
  ],
  does_not_prove: [
    "真实浏览器 UI 渲染与用户可见（ui_surface 腿工具缺席=NOT_RUN）",
    "真实多用户并发与鉴权边界",
  ],
} as const;

function grnPath(grn: string): string {
  return join(root, ".pomaster", "evidence", "runs", `${grn}.json`);
}

function grnNote(grn: string): string {
  const doc = JSON.parse(readFileSync(grnPath(grn), "utf8")) as {
    gate_result: { result: { scope: { note: string } } };
  };
  return doc.gate_result.result.scope.note;
}

function grnArtifactJson(grn: string): Record<string, unknown> {
  const doc = JSON.parse(readFileSync(grnPath(grn), "utf8")) as {
    artifact_refs?: { blob: { storage_path: string } }[];
  };
  const storagePath = doc.artifact_refs?.[0]?.blob.storage_path;
  expect(storagePath, "runtime GRN 须有 artifact blob（内容寻址）").toBeDefined();
  const bytes = readFileSync(join(root, ".pomaster", "evidence", ...(storagePath as string).split("/")), "utf8");
  return JSON.parse(bytes) as Record<string, unknown>;
}

// ============================================================
// Case E probe：mock/real 双腿共享脚本（--persists 注入 server 行为；单进程内
// 真实 listen socket + 真实写盘 + 真实 loopback 请求 + cleanup 证据）。
// ============================================================

const CASE_E_PROBE = `import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const taskRef = opt("--task-ref", "TASK.W5.REPLAY");
const controlRef = opt("--control-ref", "react:src/ImportPanel.tsx:1:1:onClick");
const persists = opt("--persists", "true") === "true";
const leg = opt("--leg", "mock");
// 隔离 fixture root 由编排（spec）预建并登记进 probe manifest——manifest/report 的
// fixture.ref 逐字对账（tool-binding spawn 前校验面），probe 只消费给定 root。
const fixtureRoot = opt("--fixture-root", "");

const storageDir = join(fixtureRoot, "storage");
mkdirSync(storageDir, { recursive: true });
const storageFile = join(storageDir, "records.json");
let cleanupAttempted = false;
let cleanupSucceeded = false;
const sha = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");

const server = createServer((req, res) => {
  const respond = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.method === "POST" && req.url === "/import") {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const request = JSON.parse(raw);
      if (persists) {
        const records = existsSync(storageFile) ? JSON.parse(readFileSync(storageFile, "utf8")) : [];
        for (const row of request.records) records.push({ name: row.name, project_id: request.project_id });
        writeFileSync(storageFile, JSON.stringify(records), "utf8");
        // 落库：persisted_digest = 持久化文件字节的真实内容摘要（重读可对账）。
        respond(200, { imported_count: request.records.length, persisted_digest: sha(readFileSync(storageFile, "utf8")) });
      } else {
        // real 腿注入（M:54-56 事故本体）：仅解析——响应 shape 相同、持久化摘要缺席。
        respond(200, { imported_count: request.records.length, persisted_digest: null });
      }
    });
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/list")) {
    const projectId = new URL(req.url, "http://localhost").searchParams.get("project_id");
    const records = existsSync(storageFile) ? JSON.parse(readFileSync(storageFile, "utf8")) : [];
    const items = records.filter((row) => row.project_id === projectId);
    respond(200, { items, imported_count: items.length });
    return;
  }
  respond(404, { error: "not_found" });
});

async function main() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = "http://127.0.0.1:" + String(server.address().port);
  const request = { project_id: "p-1", records: [{ name: "row-1" }, { name: "row-2" }] };
  const body = JSON.stringify(request);
  const importResp = await (await fetch(baseUrl + "/import", { method: "POST", body })).json();
  const listResp = await (await fetch(baseUrl + "/list?project_id=p-1")).json();
  const importedVisible = Array.isArray(listResp.items) && listResp.items.length === request.records.length;
  const listDigest = sha(JSON.stringify(listResp));
  const seg = { operation_id: "import-records", control_ref: controlRef, scenario_ref: "import-seam" };
  const trace = [
    { stage: "request", ...seg, request_digest: sha(body), readback_digest: null, visible_result: null },
    { stage: "persist", ...seg, request_digest: null, readback_digest: importResp.persisted_digest, visible_result: null },
    { stage: "re_read", ...seg, request_digest: sha("GET /list?project_id=p-1"), readback_digest: listDigest, visible_result: null },
    { stage: "mapping", ...seg, request_digest: null, readback_digest: typeof listResp.imported_count === "number" ? listDigest : null, visible_result: null },
    { stage: "visible", ...seg, request_digest: null, readback_digest: null, visible_result: importedVisible },
  ];
  await new Promise((resolve) => server.close(() => resolve(undefined)));
  cleanupAttempted = true;
  try { rmSync(fixtureRoot, { recursive: true, force: true }); } catch { /* cleanup 失败如实上报 */ }
  cleanupSucceeded = !existsSync(fixtureRoot);
  process.stdout.write(JSON.stringify({
    schema: "pomaster.control-data-flow-runtime/v2",
    task_ref: taskRef,
    static_control_ref: controlRef,
    side_effect: "INTERACTIVE_REVERSIBLE",
    fixture: { isolated: true, ref: "fixture:" + fixtureRoot },
    cleanup: { required: true, attempted: cleanupAttempted, succeeded: cleanupSucceeded },
    observations: {
      control: true,
      request_or_storage: importResp.imported_count === 2 && importResp.persisted_digest !== null,
      response_or_ack: importResp.imported_count === 2,
      readback: typeof listResp.imported_count === "number",
      feedback: importedVisible,
      error_recovery: true,
    },
    correlation_id: "w5-seam-" + leg,
    trace,
    seam_observation: {
      operation_id: "import-records",
      contract_ref: "OAS.IMPORT@1",
      scenario_ref: "import-seam",
      shape_fields: [
        { name: "imported_count", type: "integer", nullable: false },
        { name: "items", type: "array", nullable: false },
      ],
      error_semantics: ["404_NOT_FOUND"],
      mutation: { persisted: importResp.persisted_digest !== null, undoable: false },
      state_transition: "empty→imported",
      visible: importedVisible,
    },
  }));
}

main().catch((error) => {
  if (!cleanupAttempted) {
    try { server.close(); rmSync(fixtureRoot, { recursive: true, force: true }); } catch { /* 尽力清理 */ }
  }
  process.stderr.write(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});`;

// ============================================================
// Case F probe：write→persist→re_read→mapping→visible 全链（--bind-project-id
// 注入 server 端 scope 绑定缺失——M:41-44 事故本体：write 200 但 list 遮蔽）。
// ============================================================

const CASE_F_PROBE = `import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const taskRef = opt("--task-ref", "TASK.W5.REPLAY");
const controlRef = opt("--control-ref", "react:src/BucCard.tsx:1:1:onSave");
const bindProjectId = opt("--bind-project-id", "true") === "true";
// 同 Case E：隔离 fixture root 由 spec 预建（manifest 对账词形要求 ref 逐字相等）。
const fixtureRoot = opt("--fixture-root", "");

const storageDir = join(fixtureRoot, "storage");
mkdirSync(storageDir, { recursive: true });
const storageFile = join(storageDir, "items.json");
let cleanupAttempted = false;
let cleanupSucceeded = false;
let nextId = 0;
const sha = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");

const server = createServer((req, res) => {
  const respond = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  const records = () => (existsSync(storageFile) ? JSON.parse(readFileSync(storageFile, "utf8")) : []);
  if (req.method === "POST" && req.url === "/items") {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const request = JSON.parse(raw);
      // 事故注入点（M:41-44）：创建时丢 project_id 绑定——HTTP 200 + 落库成功，
      // 但 list 的 project_id 过滤永远查不到（保存成功 ≠ 用户可见）。
      const record = { id: nextId, name: request.name, project_id: bindProjectId ? request.project_id : null };
      nextId += 1;
      const all = records();
      all.push(record);
      writeFileSync(storageFile, JSON.stringify(all), "utf8");
      respond(200, { id: record.id, persisted_digest: sha(readFileSync(storageFile, "utf8")) });
    });
    return;
  }
  if (req.method === "GET" && /^\\/items\\/[0-9]+$/.test(req.url)) {
    const id = Number(req.url.split("/")[2]);
    const found = records().find((row) => row.id === id);
    respond(found === undefined ? 404 : 200, found === undefined ? { error: "not_found" } : { id: found.id, name: found.name });
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/items?")) {
    const projectId = new URL(req.url, "http://localhost").searchParams.get("project_id");
    respond(200, { items: records().filter((row) => row.project_id === projectId) });
    return;
  }
  respond(404, { error: "not_found" });
});

async function main() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = "http://127.0.0.1:" + String(server.address().port);
  const writeBody = JSON.stringify({ project_id: "p-1", name: "BUC-1" });
  const writeResp = await (await fetch(baseUrl + "/items", { method: "POST", body: writeBody })).json();
  const detailResp = await (await fetch(baseUrl + "/items/" + String(writeResp.id))).json();
  const listResp = await (await fetch(baseUrl + "/items?project_id=p-1")).json();
  const visible = Array.isArray(listResp.items) && listResp.items.some((row) => row.id === writeResp.id);
  const detailDigest = sha(JSON.stringify(detailResp));
  const seg = { operation_id: "create-buc", control_ref: controlRef, scenario_ref: "save-visible" };
  const trace = [
    { stage: "request", ...seg, request_digest: sha(writeBody), readback_digest: null, visible_result: null },
    { stage: "persist", ...seg, request_digest: null, readback_digest: writeResp.persisted_digest, visible_result: null },
    { stage: "re_read", ...seg, request_digest: sha("GET /items/" + String(writeResp.id)), readback_digest: detailDigest, visible_result: null },
    { stage: "mapping", ...seg, request_digest: null, readback_digest: typeof detailResp.name === "string" ? detailDigest : null, visible_result: null },
    { stage: "visible", ...seg, request_digest: null, readback_digest: null, visible_result: visible },
  ];
  await new Promise((resolve) => server.close(() => resolve(undefined)));
  cleanupAttempted = true;
  try { rmSync(fixtureRoot, { recursive: true, force: true }); } catch { /* cleanup 失败如实上报 */ }
  cleanupSucceeded = !existsSync(fixtureRoot);
  process.stdout.write(JSON.stringify({
    schema: "pomaster.control-data-flow-runtime/v2",
    task_ref: taskRef,
    static_control_ref: controlRef,
    side_effect: "INTERACTIVE_REVERSIBLE",
    fixture: { isolated: true, ref: "fixture:" + fixtureRoot },
    cleanup: { required: true, attempted: cleanupAttempted, succeeded: cleanupSucceeded },
    observations: {
      control: true,
      request_or_storage: writeResp.persisted_digest !== null,
      response_or_ack: writeResp.id !== undefined,
      readback: detailResp.id === writeResp.id,
      feedback: visible,
      error_recovery: true,
    },
    correlation_id: "w5-visible-trace",
    trace,
  }));
}

main().catch((error) => {
  if (!cleanupAttempted) {
    try { server.close(); rmSync(fixtureRoot, { recursive: true, force: true }); } catch { /* 尽力清理 */ }
  }
  process.stderr.write(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});`;

// ============================================================
// 回放底座（runPlanRun 全链；binding 静态分母 = cdf-fake 静态报告）
// ============================================================

const STATIC_CDF_FAKE = `process.stdout.write(JSON.stringify({schema:'pomaster.control-data-flow/v1',source_root:'.',files_scanned:2,controls_scanned:2,controls:[{control_ref:'react:src/ImportPanel.tsx:1:1:onClick',framework:'react',element:'button',event:'onClick',conclusion:'proven',stages:[],issues:[],runtime_confirmation_required:true},{control_ref:'react:src/BucCard.tsx:1:1:onSave',framework:'react',element:'button',event:'onSave',conclusion:'proven',stages:[],issues:[],runtime_confirmation_required:true}],parse_failures:[]}));`;

function runtimeBinding(id: string, seamRole: "mock" | "real" | undefined, command: string): ToolBindingRecord {
  const fileSafe = id.replace(/[.]/g, "-");
  // fixture root 绝对路径（tmpdir 短名无空格——manifest/report 的 fixture.ref 逐字
  // 对账要求命令行传入值与 manifest 登记值字节相等）。
  const fixtureRoot = join(root, `fixture-${fileSafe}`);
  return {
    id, source: "built_in", transport: "cli",
    adapter_ref: "builtin.gauntlet-lite.control-data-flow-runtime",
    tool: "gauntlet:control-data-flow-runtime", tool_version_anchor: "0.1.0",
    gate: "CONTROL_DATA_FLOW_RUNTIME", gate_def: "POLICY.GATE.CONTROL_DATA_FLOW_RUNTIME@0.1.0",
    metric_dialect: "ui:control_flow_runtime_trace", capabilities: ["control_data_flow"],
    ...(seamRole !== undefined ? { seam_role: seamRole } : {}),
    execution: { command: `${command} --fixture-root ${fixtureRoot}`, cwd: ".", probe_manifest: `probe-manifest-${fileSafe}.json` },
    report_contract: { format: "pomaster-control-data-flow-runtime-json", parser_ref: "builtin.gauntlet-lite.control-data-flow-runtime/json-v1", parser_version: "0.1.0" },
    environment: { requires: false },
  };
}

const STATIC_BINDING: ToolBindingRecord = {
  id: "project.w5.replay.static", source: "built_in", transport: "cli",
  adapter_ref: "builtin.gauntlet-lite.control-data-flow",
  tool: "gauntlet:control-data-flow", tool_version_anchor: "0.1.0",
  gate: "CONTROL_DATA_FLOW", gate_def: "POLICY.GATE.CONTROL_DATA_FLOW@0.1.0",
  metric_dialect: "ui:control_flow_chain", capabilities: ["control_data_flow"],
  execution: { command: "node cdf-static-fake.mjs", cwd: "." },
  report_contract: { format: "pomaster-control-data-flow-json", parser_ref: "builtin.gauntlet-lite.control-data-flow/json-v1", parser_version: "0.1.0" },
  environment: { requires: false },
};

/**
 * probe manifest（契约 §5 fixture_layer 声明 + INTERACTIVE_REVERSIBLE 副作用门）。
 * fixture.ref=spec 预建的腿专属隔离目录（manifest/report 逐字对账——每腿独立隔离，
 * 副作用门：isolated+cleanup_ref 在 spawn 前校验）。
 */
function probeManifestJson(fixtureRef: string, staticControlRef = "react:src/ImportPanel.tsx:1:1:onClick"): string {
  return JSON.stringify({
    schema: "pomaster.control-data-flow-runtime-probe/v1",
    task_ref: "TASK.W5.REPLAY",
    static_control_ref: staticControlRef,
    side_effect: "INTERACTIVE_REVERSIBLE",
    fixture: { isolated: true, ref: fixtureRef },
    cleanup_ref: "w5-replay:probe-rm-fixture-root",
    fixture_layer: { kind: W5_HTTP_FIXTURE_DECLARATION.kind, proves: [...W5_HTTP_FIXTURE_DECLARATION.proves], does_not_prove: [...W5_HTTP_FIXTURE_DECLARATION.does_not_prove] },
  });
}

const REPLAY_FACES = [
  "behavior=present:导入/保存链路变化",
  "ui=absent:无静态 UI 变更",
  "api=absent:无对外 API 契约变更",
  "data_read_write=present:导入与保存的持久化语义",
  "migration=absent:无迁移",
  "permission=absent:无权限面",
  "dependency=absent:无依赖变化",
  "concurrency=absent:无并发语义",
  "performance=absent:无性能义务",
  "deployment_config=absent:无部署配置",
];

async function replayFixture(bindings: readonly ToolBindingRecord[], acceptance: unknown): Promise<string> {
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "w5-replay-fixture" }));
  writeFileSync(join(root, "cdf-static-fake.mjs"), STATIC_CDF_FAKE);
  writeFileSync(join(root, "cdf-seam-probe.mjs"), CASE_E_PROBE);
  writeFileSync(join(root, "cdf-visible-probe.mjs"), CASE_F_PROBE);
  // 每条 runtime binding 预建腿专属隔离 fixture root + 专属 probe manifest
  // （fixture.ref 逐字对账 + INTERACTIVE_REVERSIBLE 隔离义务——副作用门不放宽）。
  for (const binding of bindings) {
    const fileSafe = binding.id.replace(/[.]/g, "-");
    const legStaticRef = binding.id.includes("visible") ? "react:src/BucCard.tsx:1:1:onSave" : "react:src/ImportPanel.tsx:1:1:onClick";
    mkdirSync(join(root, `fixture-${fileSafe}`), { recursive: true });
    writeFileSync(join(root, `probe-manifest-${fileSafe}.json`), probeManifestJson(`fixture:${join(root, `fixture-${fileSafe}`)}`, legStaticRef));
  }
  await runInit(root);
  mkdirTools();
  writeFileSync(join(root, ".pomaster", "tools", "bindings.json"), JSON.stringify({ version: 1, bindings: [STATIC_BINDING, ...bindings] }));
  const store = await createStore(root);
  await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: {
    id: "TASK.W5.REPLAY", kind: "task_object", axisProfile: "task_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: "W5 边界回放", authority: { owner: "BOOTSTRAP_OWNER", delegates: [] }, origin: "natural",
    payload: { intent: "Case E/F 边界回放", class_scan_result: { scope: "src/**", hits: 1, fixed_count: 1, regression_case_ref: "GRN-W5R" }, acceptance },
  } as never }] });
  const execution = await beginExecution(store, { role: "orchestrator", runtime: "claude-code", identityKind: "interactive", startedAt: "2026-09-30T00:00:00.000Z" });
  return execution.execution_id;
}

function mkdirTools(): void {
  mkdirSync(join(root, ".pomaster", "tools"), { recursive: true });
}

function rewriteCommand(registryPath: string, bindingId: string, command: string): void {
  const registry = JSON.parse(readFileSync(registryPath, "utf8")) as { bindings: ToolBindingRecord[] };
  const target = registry.bindings.find((row) => row.id === bindingId);
  expect(target).toBeDefined();
  const previous = target!.execution;
  const fixtureRootFlag = previous.command.split(" --fixture-root ")[1] ?? "";
  target!.execution = { ...previous, command: `${command} --fixture-root ${fixtureRootFlag}` };
  writeFileSync(registryPath, JSON.stringify(registry));
}

// ============================================================
// Case E（R3）回放：mock 落库 / real 仅解析（shape 相同）→ seam 红在 mutation 分歧
// ============================================================

describe("Case E 回放（R3：mock/real mutation 分裂；PR-W5.3 · W0 R3）", () => {
  it("fixture 分层声明：kind=node_http_service + proves/does_not_prove 显式（契约 §5——证明范围不冒充）", () => {
    expect(W5_HTTP_FIXTURE_DECLARATION.kind).toBe("node_http_service");
    expect(W5_HTTP_FIXTURE_DECLARATION.proves.length).toBeGreaterThan(0);
    expect(W5_HTTP_FIXTURE_DECLARATION.does_not_prove).toContain("真实浏览器 UI 渲染与用户可见（ui_surface 腿工具缺席=NOT_RUN）");
    // probe manifest 携带同一声明（词形闭合）→ normalize scopeNote 呈现 kind。
    const manifest = JSON.parse(probeManifestJson()) as { fixture_layer: { kind: string; proves: string[]; does_not_prove: string[] } };
    expect(manifest.fixture_layer).toEqual({ kind: W5_HTTP_FIXTURE_DECLARATION.kind, proves: [...W5_HTTP_FIXTURE_DECLARATION.proves], does_not_prove: [...W5_HTTP_FIXTURE_DECLARATION.does_not_prove] });
  });

  it("注入：mock 腿落库 / real 腿仅解析（shape 相同）→ seam 红在 mutation_outcome 分歧；双腿语义一致后绿", async () => {
    const executionId = await replayFixture(
      [
        runtimeBinding("project.w5.seam.mock", "mock", "node cdf-seam-probe.mjs --leg mock --persists true"),
        runtimeBinding("project.w5.seam.real", "real", "node cdf-seam-probe.mjs --leg real --persists false"),
      ],
      [{ criterion: "导入结果重读可见且双腿副作用语义一致", claim: null, requires: ["control_data_flow"], scenarios: [{
        scenario_ref: "import-seam",
        precondition: "导入入口在座（project p-1）",
        interaction: "触发导入两条记录",
        state_dimensions: ["imported=true"],
        expected_observation: "导入记录在 project 过滤下的列表重读可见",
        runtime_confirmation_required: true,
        expected_observation_oracle: { visible_via: "api_list", filter_context: { project_id: "p-1" }, mapping_fields: ["imported_count"] },
        mock_real_seam: { operation_id: "import-records", contract_ref: "OAS.IMPORT@1" },
      }] }],
    );

    // —— 注入轮：real 腿仅解析（persisted_digest 缺席 → adapter 因果链断裂 failed；
    // mock 腿 passed → 编排层 seam cap warning）。红必须落在 mutation 分歧断言。
    const injected = await runPlanRun(root, { taskRef: "TASK.W5.REPLAY", executionId, changed: ["src/ImportPanel.tsx"], faces: REPLAY_FACES });
    expect(injected.ok).toBe(false);
    const seamRows = injected.result.rows.filter((row) => row.gate === "CONTROL_DATA_FLOW_RUNTIME");
    expect(seamRows.map((row) => row.binding_id).sort()).toEqual(["project.w5.seam.mock", "project.w5.seam.real"]);

    const mockRow = seamRows.find((row) => row.binding_id === "project.w5.seam.mock");
    const realRow = seamRows.find((row) => row.binding_id === "project.w5.seam.real");
    expect(mockRow?.verdict).toBe("warning");
    expect(realRow?.verdict).toBe("failed");
    const realReport = grnArtifactJson(realRow?.grn as string) as { trace: { stage: string; readback_digest: string | null }[] };
    // real 腿注入本体：仅解析——persist 段无持久化摘要（因果链断裂在 real 腿自身可判）。
    expect(realReport.trace.find((seg) => seg.stage === "persist")?.readback_digest).toBeNull();
    // 目标断言：双腿 note 都携带 seam mutation 分歧（mock persisted=true ≠ real persisted=false）。
    for (const row of [mockRow as { grn: string }, realRow as { grn: string }]) {
      const note = grnNote(row.grn);
      expect(note).toContain("w5_seam_divergent");
      expect(note).toContain("mutation_outcome");
      expect(note).toContain("mock persisted=true ≠ real persisted=false");
    }
    // mock 腿：工具真实 verdict 保留留痕 + 编排层 cap 词形（append-only 不改写）。
    expect(grnNote(mockRow?.grn as string)).toContain("verdict_before_obligation_cap=passed");

    // —— 修复轮：real 腿补落库语义（真实事故修复=real 实现副作用对齐 mock）。
    // binding fingerprint 变化 → 双腿重跑 → seam 五维一致 → 全绿。
    const registryPath = join(root, ".pomaster", "tools", "bindings.json");
    rewriteCommand(registryPath, "project.w5.seam.real", "node cdf-seam-probe.mjs --leg real --persists true");
    const repaired = await runPlanRun(root, { taskRef: "TASK.W5.REPLAY", executionId, changed: ["src/ImportPanel.tsx"], faces: REPLAY_FACES });
    expect(repaired.ok).toBe(true);
    const repairedRows = repaired.result.rows.filter((row) => row.gate === "CONTROL_DATA_FLOW_RUNTIME");
    for (const row of repairedRows) {
      expect(row.verdict).toBe("passed");
      const report = grnArtifactJson(row.grn) as { cleanup: { succeeded: boolean }; seam_observation: { mutation: { persisted: boolean } } };
      expect(report.cleanup.succeeded).toBe(true);
      expect(report.seam_observation.mutation.persisted).toBe(true);
    }
    // 注入轮 GRN append-only 保留（旧证据不改写不删除）。
    expect(existsSync(grnPath(mockRow?.grn as string))).toBe(true);
    expect(existsSync(grnPath(realRow?.grn as string))).toBe(true);
  });
});

// ============================================================
// Case F（R4）回放：write 200 但 scope 过滤遮蔽 → visible 腿缺失红；修复 scope
// 绑定后 request→persist→re_read→mapping→visible 全链绿（visible_via=api_list）。
// ============================================================

describe("Case F 回放（R4：保存 200 但 scope 不可见；PR-W5.3 · W0 R4）", () => {
  it("注入：write 200+落库成功但 server 端丢 project_id → visible_result=false 红；修复 scope 绑定后全链绿", async () => {
    const executionId = await replayFixture(
      [runtimeBinding("project.w5.visible.leg", undefined, "node cdf-visible-probe.mjs --bind-project-id false")],
      [{ criterion: "保存的 BUC 在 project 过滤下列表可见", claim: null, requires: ["control_data_flow"], scenarios: [{
        scenario_ref: "save-visible",
        precondition: "BUC 创建入口在座（project p-1）",
        interaction: "保存一张 BUC 卡",
        state_dimensions: ["saved=true"],
        expected_observation: "BUC 在 project_id=p-1 的列表过滤下可见",
        runtime_confirmation_required: true,
        expected_observation_oracle: { visible_via: "api_list", filter_context: { project_id: "p-1" }, mapping_fields: ["name"] },
      }] }],
    );

    // —— 注入轮：write 200 + persist 落库成功（persisted_digest 在场），但 server 端
    // 丢 project_id → list 过滤查不到 → visible_result=false。红=oracle 声明链
    // visible 段不可见（目标断言），非 CLI/环境崩溃。
    const injected = await runPlanRun(root, { taskRef: "TASK.W5.REPLAY", executionId, changed: ["src/BucCard.tsx"], faces: REPLAY_FACES });
    expect(injected.ok).toBe(false);
    const runtimeRow = injected.result.rows.find((row) => row.gate === "CONTROL_DATA_FLOW_RUNTIME");
    expect(runtimeRow?.verdict).toBe("warning");
    const note = grnNote(runtimeRow?.grn as string);
    expect(note).toContain("w5_oracle_visible_chain_incomplete");
    expect(note).toContain("visible_result=false");
    const report = grnArtifactJson(runtimeRow?.grn as string) as {
      trace: { stage: string; visible_result: boolean | null; readback_digest: string | null }[];
      cleanup: { required: boolean; attempted: boolean; succeeded: boolean };
    };
    // 事故形态逐段对账：write 200（request/persist/re_read/mapping 全在场）仅 visible 段断。
    expect(report.trace.map((seg) => seg.stage)).toEqual(["request", "persist", "re_read", "mapping", "visible"]);
    expect(report.trace.find((seg) => seg.stage === "persist")?.readback_digest).not.toBeNull();
    expect(report.trace.find((seg) => seg.stage === "visible")?.visible_result).toBe(false);
    // 副作用门证据：隔离 fixture + cleanup 真实发生（INTERACTIVE_REVERSIBLE 纪律）。
    expect(report.cleanup).toEqual({ required: true, attempted: true, succeeded: true });
    expect(grnNote(runtimeRow?.grn as string)).toContain("fixture_layer=node_http_service");

    // —— 修复轮：server 端补 scope 绑定（写盘带 project_id）→ visible=true 全链绿。
    const registryPath = join(root, ".pomaster", "tools", "bindings.json");
    rewriteCommand(registryPath, "project.w5.visible.leg", "node cdf-visible-probe.mjs --bind-project-id true");
    const repaired = await runPlanRun(root, { taskRef: "TASK.W5.REPLAY", executionId, changed: ["src/BucCard.tsx"], faces: REPLAY_FACES });
    expect(repaired.ok).toBe(true);
    const repairedRow = repaired.result.rows.find((row) => row.gate === "CONTROL_DATA_FLOW_RUNTIME");
    expect(repairedRow?.verdict).toBe("passed");
    const repairedReport = grnArtifactJson(repairedRow?.grn as string) as { trace: { stage: string; visible_result: boolean | null }[] };
    // oracle 声明链（契约 §2）：request→persist→re_read→mapping→visible 全段在场且 visible=true。
    expect(repairedReport.trace.map((seg) => seg.stage)).toEqual(["request", "persist", "re_read", "mapping", "visible"]);
    expect(repairedReport.trace.find((seg) => seg.stage === "visible")?.visible_result).toBe(true);
  });

  it("ui_surface 义务对照：api_list 腿不冒充 UI 可见（工具缺席=NOT_RUN——契约 §5 环境诚实）", () => {
    // 本文件 node_http_service fixture does_not_prove 真实浏览器可见——ui_surface
    // 义务的 NOT_RUN 呈现已在 plan-runner.spec W5 describe（w5_ui_surface_leg_not_run）
    // 用 api 层 runtime 腿实测：此处锚定声明一致性（fixture 层与义务层互证，不重复起链）。
    expect(W5_HTTP_FIXTURE_DECLARATION.does_not_prove.join("；")).toContain("NOT_RUN");
    expect(W5_HTTP_FIXTURE_DECLARATION.kind).toBe("node_http_service");
  });
});
