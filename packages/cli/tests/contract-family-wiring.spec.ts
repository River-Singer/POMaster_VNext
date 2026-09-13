/**
 * contract-family-wiring.spec.ts —— W3-S4 切片：API 契约族（C07 API / C08 Contract）
 * 真实接线钉住——GATE.BE.API.CONTRACT_CHECKS 经真实 CLI check --gates 全链闭环。
 *
 * 链路（沿 ts-family-bindings.spec.ts / contract-arch-legs-e2e.spec.ts 先例）：
 *   runInit（fixture 项目，tempdir）→ contract-gate.json 声明 → runCheckGates（六 recipe
 *   真实派发，静态派发表不动）→ contract adapter 真跑（operation_ids 机判 / 三口径缺席
 *   分流）→ kernel normalizeGateResult 复算（P12c 假绿封死边界）→ record_gate_run 单事务
 *   入账 → evidence/runs/GRN-*.json 落盘对账。
 *
 * 路径裁定（c99 表 B C07/C08 + W3-S4 排期；本仓无自有 OpenAPI spec——不伪造）：
 *   本仓 dogfood 现状 = contract-gate.json 缺席 → GRN not_configured（本仓 .pomaster
 *   GRN-0005 实证，gitignored 本机账本）；接线闭环以 fixture 项目钉住（openapi 样例只住
 *   tempdir 测试仓，不入仓库树）。
 *
 * 每族「缺席/坏输入」三分流验收（c99 第 20 项 R3-2 随族 RED 纪律）：
 *   config 缺席 → not_configured / 工具缺席（schemathesis 双路：宿主无工具 = NOT_INSTALLED、
 *   宿主有工具 = 版本锚强制 runner_not_ready——两路同归 not_run）→ not_run /
 *   声明的 openapi 不可读 → not_run——全部非绿非红禁静默当通过。
 *
 * 红线：零伪造 spec/报告求绿；零新增词形（verdict 七态 / 口径三件套 / GRN 词形全部
 *   既有词）；C08 consumer/provider 双向（Pact）本仓未接入——如实不冒充（本文件不产
 *   Pact 相关声明）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCheckGates, runInit, type GatesCheckResult, type GateRecipeRunRow } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-contract-family-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** 行级扫描可提取的 openapi 样例（YAML 词形；只住 tempdir fixture，不入仓库树）。 */
const OPENAPI_YAML = [
  "openapi: 3.0.3",
  "info:",
  "  title: demo",
  "  version: 1.0.0",
  "paths:",
  "  /users:",
  "    get:",
  "      operationId: getUser",
  "      responses:",
  "        '200':",
  "          description: ok",
  "    post:",
  "      operationId: createUser",
  "      responses:",
  "        '201':",
  "          description: created",
].join("\n");

function writeContractGate(config: unknown): void {
  writeFileSync(join(root, "contract-gate.json"), JSON.stringify(config), "utf8");
}

function writeOpenapi(rel: string, text: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, text, "utf8");
}

function contractRow(result: GatesCheckResult): GateRecipeRunRow {
  const row = result.rows.find((candidate) => candidate.recipe === "GATE.BE.API.CONTRACT_CHECKS");
  if (row === undefined) throw new Error("contract recipe 行不在 check --gates 结果中");
  return row;
}

/** GRN 落盘文档读侧复验（evidence/runs/GRN-*.json 的 inline result 形态）。 */
function readGrnInline(grn: string): Record<string, unknown> {
  const path = join(root, ".pomaster", "evidence", "runs", `${grn}.json`);
  expect(existsSync(path)).toBe(true);
  const doc = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  return ((doc["gate_result"] as Record<string, unknown>)["result"] ?? {}) as Record<string, unknown>;
}

describe("CONTRACT 族经真实 CLI check --gates 全链（W3-S4）", () => {
  it("operation_ids 口径：声明齐备真跑 → contract 行 passed GRN 入账（kernel 复算 + 落盘 recipe 身份）", async () => {
    await runInit(root);
    writeContractGate({
      openapi: "spec/openapi.yaml",
      expectedOperationIds: ["getUser", "createUser"],
    });
    writeOpenapi("spec/openapi.yaml", OPENAPI_YAML);

    const outcome = await runCheckGates(root);

    // 六 recipe 逐行呈现：contract 行 passed，其余五行缺席/判定如实——ok=false 是
    // 「零静默跳过」的诚实出口（任一非 passed 行都显式报错，不伪装全绿）。
    expect(outcome.ok).toBe(false);
    expect(outcome.result.recipes_total).toBe(6);
    const row = contractRow(outcome.result);
    expect(row.grn).toBe("GRN-0001");
    expect(row.verdict).toBe("passed");
    expect(row.tool).toBe("gauntlet:contract");
    expect(row.metric_dialect).toBe("contract:operation_id_existence");
    expect(outcome.result.passed).toBe(1);
    expect(outcome.result.rows.filter((candidate) => candidate.verdict === "passed").length).toBe(1);

    // 落盘面：GRN 经 kernel 复算入账，recipe 身份重绑落盘（gate_def = recipe anchor）。
    const inline = readGrnInline("GRN-0001");
    expect(inline["verdict"]).toBe("passed");
    expect(inline["gate"]).toBe("GATE_BE_API_CONTRACT_CHECKS");
    expect(inline["gate_def"]).toBe("GATE.BE.API.CONTRACT_CHECKS@0.1.0");
    expect(inline["tool"]).toBe("gauntlet:contract");
    expect(inline["counts"]).toEqual({
      scanned: 2,
      applicable_scanned: 2,
      violations: 0,
      not_applicable: 0,
    });
  });

  it("机判缺失：声明的 operationId 未出现在契约 → failed GRN 入账（真判卷非摆设，逐行显式报错）", async () => {
    await runInit(root);
    writeContractGate({
      openapi: "spec/openapi.yaml",
      expectedOperationIds: ["getUser", "deleteUser"],
    });
    writeOpenapi("spec/openapi.yaml", OPENAPI_YAML);

    const outcome = await runCheckGates(root);

    expect(outcome.ok).toBe(false);
    const row = contractRow(outcome.result);
    expect(row.verdict).toBe("failed");
    // fixture 分母外另有 createUser——adapter 显式留痕（「对账分母外另有 N 个未声明
    // operationId」），不沉默也不混入判卷分母（RED 实测修正：留痕本身是诚实契约）。
    expect(String(row.note ?? "")).toContain("对账分母外另有");
    // 逐行显式报错（fail-closed 出口：非 passed 行进 errors，禁静默）。
    expect(outcome.errors.some((error) => error.code === "GATE_FAILED" && error.message.includes(row.grn))).toBe(true);

    const inline = readGrnInline(row.grn);
    expect(inline["verdict"]).toBe("failed");
    expect(inline["counts"]).toMatchObject({ scanned: 2, violations: 1 });
    const items = inline["items"] as ReadonlyArray<{ rule?: string; location?: string }>;
    expect(items[0]?.rule).toBe("operation_id_missing");
    expect(items[0]?.location).toBe("spec/openapi.yaml#deleteUser");
  });

  it("空声明清单：expectedOperationIds=[] → warning GRN 入账（zero_declared_operations_nothing_verified——零对账禁当 passed）", async () => {
    await runInit(root);
    writeContractGate({ openapi: "spec/openapi.yaml", expectedOperationIds: [] });
    writeOpenapi("spec/openapi.yaml", OPENAPI_YAML);

    const outcome = await runCheckGates(root);

    expect(outcome.ok).toBe(false);
    const row = contractRow(outcome.result);
    expect(row.verdict).toBe("warning");
    expect(outcome.result.rows.filter((candidate) => candidate.verdict === "passed").length).toBe(0);

    const inline = readGrnInline(row.grn);
    expect(inline["verdict"]).toBe("warning");
    expect(inline["verdict_cap_reason"]).toBe("zero_declared_operations_nothing_verified");
    expect(inline["counts"]).toMatchObject({ scanned: 0, violations: 0 });
  });

  it("未声明 contract-gate.json（本仓 GRN-0005 dogfood 同构）→ not_configured GRN 如实入账（counts 显式全零 + 配置指引）", async () => {
    await runInit(root);

    const outcome = await runCheckGates(root);

    expect(outcome.ok).toBe(false);
    const row = contractRow(outcome.result);
    expect(row.verdict).toBe("not_configured");
    expect(String(row.note ?? "")).toContain("contract-gate.json");
    expect(row.tool).toBe("gauntlet:contract");

    const inline = readGrnInline(row.grn);
    expect(inline["verdict"]).toBe("not_configured");
    expect(inline["counts"]).toEqual({
      scanned: 0,
      applicable_scanned: 0,
      violations: 0,
      not_applicable: 0,
    });
    const scope = inline["scope"] as { note?: string } | undefined;
    expect(String(scope?.note ?? "")).toContain("contract-gate.json");
  });

  it("schemathesis 口径声明 + 工具缺席 → not_run GRN 入账（宿主双路同归：无工具=NOT_INSTALLED / 有工具=版本锚强制——非绿非红）", async () => {
    await runInit(root);
    writeContractGate({
      openapi: "spec/openapi.yaml",
      schemathesis: {
        command: "schemathesis run spec/openapi.yaml --url http://127.0.0.1:9/api --report ndjson",
      },
    });
    writeOpenapi("spec/openapi.yaml", OPENAPI_YAML);

    const outcome = await runCheckGates(root);

    expect(outcome.ok).toBe(false);
    const row = contractRow(outcome.result);
    // 宿主无 schemathesis → prepare 判 tool_absent → not_run；
    // 宿主有 schemathesis → check --gates 不供版本锚 → GateAdapterError(runner_not_ready)
    // → not_run。两路都是诚实缺席（非绿非红），判词都点名 schemathesis。
    expect(row.verdict).toBe("not_run");
    expect(String(row.note ?? "")).toContain("schemathesis");

    const inline = readGrnInline(row.grn);
    expect(inline["verdict"]).toBe("not_run");
    expect(inline["counts"]).toEqual({
      scanned: 0,
      applicable_scanned: 0,
      violations: 0,
      not_applicable: 0,
    });
  });

  it("声明的 openapi 不可读 → not_run（坏输入非绿非红——三分流第三腿，禁静默当通过）", async () => {
    await runInit(root);
    writeContractGate({
      openapi: "spec/missing.yaml",
      expectedOperationIds: ["getUser"],
    });

    const outcome = await runCheckGates(root);

    expect(outcome.ok).toBe(false);
    const row = contractRow(outcome.result);
    expect(row.verdict).toBe("not_run");
    expect(String(row.note ?? "")).toContain("不可读");

    const inline = readGrnInline(row.grn);
    expect(inline["verdict"]).toBe("not_run");
    expect(String((inline["scope"] as { note?: string })?.note ?? "")).toContain("spec/missing.yaml");
  });
});
