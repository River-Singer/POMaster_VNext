/**
 * CONTRACT adapter spec（G5 谱系扩展：config 驱动 openapi operation_id 存在性对账）。
 *
 * 覆盖：detect 未声明/已声明/形态非法多态 / not_configured 诚实缺席全链路（≠passed，
 * 非静默）/ reconcile 全命中→passed / 存在-缺失两态→failed + items 明细 / openapi 不可读
 * →not_run / 空清单→warning（报绿的机器自我怀疑）/ YAML 与 JSON 两种 operationId 词形。
 * run 走真实 fs（读 openapi 文件），故链路用例一律真实临时目录；detect 形态矩阵用 fake facts。
 * 全部记录经 toGateResultJson × ajv 03 schema 复验。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTRACT_GATE_CONFIG_FILE,
  createContractAdapter,
  extractOperationIds,
  toGateResultJson,
  type DetectorFacts,
  type GatePolicy,
  type GateResultRecord,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";
import { fakeFacts, posixJoin } from "./helpers.js";

const adapter = createContractAdapter();

const ROOT = "D:/contract-proj";

const OPENAPI_YAML = `openapi: 3.0.3
info:
  title: demo
  version: 1.0.0
paths:
  /users/{id}:
    get:
      operationId: getUser
      responses:
        "200": {}
  /users:
    post:
      operationId: createUser
      responses:
        "201": {}
`;

// 行级扫描的 JSON 词形按工程实际形态（pretty-print，operationId 独占一行）。
const OPENAPI_JSON = JSON.stringify(
  { openapi: "3.0.3", paths: { "/ping": { get: { operationId: "ping" } } } },
  null,
  2,
);

function policy(): GatePolicy {
  return { grn: "GRN-81", ranAtSeq: 81, trigger: "on_demand" };
}

function configJson(openapi: string, ids: string[]): string {
  return JSON.stringify({ openapi, expectedOperationIds: ids });
}

// ============================================================
// detect：config 形态矩阵（fake facts，零 I/O）
// ============================================================

function factsWithConfig(files: Record<string, string | null>): DetectorFacts {
  return fakeFacts(ROOT, { files });
}

describe("contract adapter detect", () => {
  it("无 contract-gate.json → NOT_INSTALLED + 落位指引（禁静默）", () => {
    const detection = adapter.detect(factsWithConfig({}));
    expect(detection.status).toBe("NOT_INSTALLED");
    if (detection.status === "NOT_INSTALLED") {
      expect(detection.reason).toMatch(/contract-gate\.json/);
      expect(detection.installHint).toMatch(/expectedOperationIds/);
    }
  });

  it("声明齐备 → READY，evidence 指到配置路径与对账分母数量", () => {
    const detection = adapter.detect(
      factsWithConfig({
        [posixJoin(ROOT, CONTRACT_GATE_CONFIG_FILE)]: configJson("openapi.yaml", ["getUser"]),
      }),
    );
    expect(detection.status).toBe("READY");
    if (detection.status === "READY") {
      expect(detection.evidence).toContain("openapi.yaml");
      expect(detection.evidence).toContain("1 个 operation_id");
    }
  });

  it("配置缺 expectedOperationIds → NOT_INSTALLED（对账分母必须显式，可为空数组）", () => {
    const detection = adapter.detect(
      factsWithConfig({
        [posixJoin(ROOT, CONTRACT_GATE_CONFIG_FILE)]:
          JSON.stringify({ openapi: "openapi.yaml" }),
      }),
    );
    expect(detection.status).toBe("NOT_INSTALLED");
  });

  it("配置 JSON 不可解析 → NOT_INSTALLED 显式留痕（禁静默）", () => {
    const detection = adapter.detect(
      factsWithConfig({
        [posixJoin(ROOT, CONTRACT_GATE_CONFIG_FILE)]: "{ broken",
      }),
    );
    expect(detection.status).toBe("NOT_INSTALLED");
    if (detection.status === "NOT_INSTALLED") {
      expect(detection.reason).toMatch(/不可解析/);
    }
  });
});

// ============================================================
// 全链路（真实临时目录：config 与 openapi 落真实盘，prepare 走真实探测）
// ============================================================

function makeContractProject(config: string | null, files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "pomaster-gauntlet-contract-"));
  if (config !== null) {
    writeFileSync(join(root, CONTRACT_GATE_CONFIG_FILE), config, "utf8");
  }
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(root, name), content, "utf8");
  }
  return root;
}

function fullPipeline(projectRoot: string, gatePolicy: GatePolicy = policy()): GateResultRecord {
  // 不注入 facts → platformDetectorFacts 真实探测（与 run 的真实 fs 同源）。
  const plan = adapter.prepare({ projectRoot }, gatePolicy);
  const raw = adapter.run(plan);
  return adapter.normalize(raw, {});
}

const ajv = new Ajv({ strictSchema: false });
addFormats(ajv);
const validate = ajv.compile(gateResultSchema as unknown as Parameters<typeof ajv.compile>[0]);

describe("contract adapter：not_configured 诚实缺席", () => {
  it("未声明全链路 → verdict=not_configured（≠passed）+ scope.note 指引 + counts 显式全零", () => {
    const record = fullPipeline(makeContractProject(null));
    expect(record.verdict).toBe("not_configured");
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    expect(record.scopeNote).toMatch(/contract-gate\.json/);
    expect(record.scopeNote).toMatch(/not_configured/);
    const doc = toGateResultJson(record);
    const scope = doc["scope"] as Record<string, unknown> | undefined;
    expect(typeof scope?.["note"]).toBe("string");
    if (!validate(doc)) {
      console.error(validate.errors);
    }
    expect(validate(doc)).toBe(true);
  });
});

describe("contract adapter：存在性对账", () => {
  it("全部命中 → passed；counts=声明清单粒度；blindspot escape=0", () => {
    const record = fullPipeline(
      makeContractProject(configJson("openapi.yaml", ["getUser", "createUser"]), {
        "openapi.yaml": OPENAPI_YAML,
      }),
    );
    expect(record.verdict).toBe("passed");
    expect(record.counts).toEqual({
      scanned: 2,
      applicableScanned: 2,
      violations: 0,
      notApplicable: 0,
    });
    expect(record.blindspot).toEqual({ scanned: 2, produced: 2, escapeRatio: 0 });
    expect(record.items).toBeUndefined();
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("存在/缺失两态：1 缺 → failed violations=1 + items location 仓内相对路径（无盘符）", () => {
    const record = fullPipeline(
      makeContractProject(configJson("openapi.yaml", ["getUser", "deleteUser"]), {
        "openapi.yaml": OPENAPI_YAML,
      }),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.items).toHaveLength(1);
    expect(record.items?.[0]?.rule).toBe("operation_id_missing");
    expect(record.items?.[0]?.location).toBe("openapi.yaml#deleteUser");
    expect(record.blindspot.escapeRatio).toBeCloseTo(0.5, 12);
    const doc = toGateResultJson(record);
    if (!validate(doc)) {
      console.error(validate.errors);
    }
    expect(validate(doc)).toBe(true);
  });

  it("JSON 形态 openapi 的 operationId 词形同样可提取（宽容扫描）", () => {
    expect(extractOperationIds(OPENAPI_JSON)).toEqual(["ping"]);
    const record = fullPipeline(
      makeContractProject(configJson("api.json", ["ping"]), { "api.json": OPENAPI_JSON }),
    );
    expect(record.verdict).toBe("passed");
  });

  it("openapi 文件不可读 → not_run（非绿非红，禁静默当通过）", () => {
    const record = fullPipeline(makeContractProject(configJson("missing.yaml", ["getUser"])));
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/不可读/);
  });

  it("期望清单为空 → warning + zero_declared_operations_nothing_verified（零对账不是 passed）", () => {
    const record = fullPipeline(
      makeContractProject(configJson("openapi.yaml", []), { "openapi.yaml": OPENAPI_YAML }),
    );
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe("zero_declared_operations_nothing_verified");
  });

  it("对账分母外的多余 operationId → scope.note 显式留痕（不在口径内，也不沉默）", () => {
    const record = fullPipeline(
      makeContractProject(configJson("openapi.yaml", ["getUser"]), {
        "openapi.yaml": OPENAPI_YAML,
      }),
    );
    expect(record.verdict).toBe("passed");
    expect(record.scopeNote).toMatch(/未声明 operationId/);
  });
});
