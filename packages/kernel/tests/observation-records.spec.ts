/**
 * observation-records.spec.ts —— vNext Batch 2 R6（C9）：OBS/ENVREC 感知回执记录
 * 落盘通路（evidence/observations/；kernel persistObservationRecord）。
 *
 * 判据锚（kernel evidence-artifacts.ts 头注 ADR + 17-perception-receipts.schema.json
 * x-index-policy）：
 * - 落盘位 evidence/observations/OBS-<n>.json / ENVREC-<n>.json（17 schema
 *   storage_plane 词形；layout 目录口径 41 含本分区——B6a 登记 12 播种目录后为 41，
 *   paths.ts 为准）；
 * - **blob 平面零改动**：本通路只落回执记录 JSON 自身，evidence/blobs/ 仍由
 *   persistEvidenceArtifact 唯一承载（裁决 8 ③ D1=A 不动摇）；
 * - sidecar 不是 truth object：不进 truth-index（admitted_to_truth_index=false 维持
 *   ——落盘后 truth-index objects 零变化）；
 * - 字节稳定（A4）：同一 record 重放逐字节相等（幂等命中零写入 idempotentHit=true）；
 *   落盘不注入任何字段（零墙钟——时间锚恒 record 自带 captured_at_seq）；
 * - fail-closed：同 id 已存在且字节不同 → REF_INTEGRITY_VIOLATION（回执记录与
 *   GRN/CLM 同族 append-only，禁静默覆写）；record_type 词表外 / id 词形越界 /
 *   OBS 记录双 id / ENVREC 缺 recordId → SCHEMA_INVALID；
 * - ENVREC 落盘 id 由通路调用方供给（environment_receipt 九键无自 id 键——17 schema
 *   冻结面零改动；ENVREC-<n> 词形已在 schema 词面，零新增词形）。
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildEnvironmentReceipt,
  buildObservationReceipt,
  countObservationRecords,
  persistObservationRecord,
} from "@pomaster/kernel";

function collectionOf(dir: string): readonly string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, entry.name);
      if (entry.isDirectory()) walk(child);
      else out.push(child);
    }
  };
  walk(dir);
  return out.sort();
}

let evidenceDir: string;
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-observation-records-"));
  evidenceDir = join(root, ".pomaster", "evidence");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** 组装最小合法 ObservationReceipt（NOT_OBSERVABLE：负观察合法不强制 artifact_refs——Case I 留痕形态；record_type 是落盘判别键）。 */
function observationRecord(): Record<string, unknown> {
  return {
    record_type: "observation_receipt",
    ...buildObservationReceipt({
      observationId: "OBS-0001",
      executionId: "AGX-2026-00042",
      sensorCapability: "SENSOR.BROWSER.SNAPSHOT",
      adapter: "chrome-devtools-mcp",
      operation: "take_snapshot",
      surface: "USER_SURFACE",
      result: "NOT_OBSERVABLE",
      capturedAtSeq: 42,
    }),
  } as Record<string, unknown>;
}

/** 组装最小合法 EnvironmentReceipt（九键 + record_type 由落盘通路补齐形态由 schema 定）。 */
function environmentRecord(): Record<string, unknown> {
  return {
    record_type: "environment_receipt",
    ...buildEnvironmentReceipt(
      {
        environment_ref: "ENV.WEB.STAGING",
        repository_ref: null,
        revision_ref: null,
        runtime_instance: null,
        base_url: "https://staging.example",
        dataset_ref: null,
        auth_role: "viewer",
      },
      "AGX-2026-00042",
      "READY",
    ),
  };
}

describe("persistObservationRecord（R6/C9 落盘通路）", () => {
  it("OBS 回执落盘 evidence/observations/OBS-0001.json（字节稳定 + 幂等命中 + 零墙钟不注入字段）", () => {
    const record = observationRecord();
    const first = persistObservationRecord(evidenceDir, record);
    expect(first.id).toBe("OBS-0001");
    expect(first.relativePath).toBe("observations/OBS-0001.json");
    expect(first.idempotentHit).toBe(false);
    const bytes = readFileSync(join(evidenceDir, "observations", "OBS-0001.json"), "utf8");
    expect(bytes.endsWith("\n")).toBe(true);
    // 字节稳定：同 record 重放逐字节相等（幂等命中零写入）。
    const second = persistObservationRecord(evidenceDir, record);
    expect(second.idempotentHit).toBe(true);
    expect(readFileSync(join(evidenceDir, "observations", "OBS-0001.json"), "utf8")).toBe(bytes);
    // 落盘零注入：记录字节与 record canonical 序列化一致（A4 零墙钟——无新增时间戳键）。
    expect(JSON.parse(bytes)).toEqual(record);
    expect(bytes).not.toMatch(/"(created_at|updated_at|persisted_at|timestamp)"/);
  });

  it("ENVREC 回执落盘（recordId 由调用方供给；ENVREC 词形闸）", () => {
    const record = environmentRecord();
    const persisted = persistObservationRecord(evidenceDir, record, { recordId: "ENVREC-0001" });
    expect(persisted.id).toBe("ENVREC-0001");
    expect(existsSync(join(evidenceDir, "observations", "ENVREC-0001.json"))).toBe(true);
    // ENVREC 词形闸：非法词形 SCHEMA_INVALID。
    expect(() =>
      persistObservationRecord(evidenceDir, record, { recordId: "envrec-1" }),
    ).toThrowError(/ENVREC/);
    // ENVREC 缺 recordId → SCHEMA_INVALID（九键冻结面零改动，落盘 id 不猜测）。
    expect(() => persistObservationRecord(evidenceDir, record)).toThrowError(/recordId/);
  });

  it("fail-closed：同 id 字节不同 → REF_INTEGRITY_VIOLATION（append-only 禁静默覆写）", () => {
    const record = observationRecord();
    persistObservationRecord(evidenceDir, record);
    const mutated = { ...record, result: "OBSERVED_ABSENT" };
    expect(() => persistObservationRecord(evidenceDir, mutated)).toThrowError(
      /REF_INTEGRITY_VIOLATION|REF_INTEGRITY/,
    );
  });

  it("词形防线：record_type 词表外 / OBS 双 id / id 词形越界 → SCHEMA_INVALID", () => {
    expect(() =>
      persistObservationRecord(evidenceDir, { record_type: "gate_result" }),
    ).toThrowError(/record_type/);
    // OBS 记录禁止再供给 recordId（单一身份，双 id = 拒收）。
    expect(() =>
      persistObservationRecord(evidenceDir, observationRecord(), { recordId: "ENVREC-0009" }),
    ).toThrowError(/recordId|单一身份/);
    // observation_id 词形越界。
    expect(() =>
      persistObservationRecord(evidenceDir, { ...observationRecord(), observation_id: "OBS-1X" }),
    ).toThrowError(/OBS-|observation_id/);
  });

  it("sidecar 不是 truth object：落盘不触碰 store（truth-index objects 零变化）+ countObservationRecords 计数", async () => {
    const { createStore } = await import("@pomaster/kernel");
    const store = await createStore(root);
    const indexBefore = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8"),
    ) as { objects: unknown[] };
    // blob 平面零改动：persistObservationRecord 不写 evidence/blobs/（createStore 骨架
    // 本就预建 blobs 目录——以文件集合快照前后相等判零写入）。
    const blobsDir = join(evidenceDir, "blobs");
    const blobsBefore = existsSync(blobsDir) ? collectionOf(blobsDir) : [];
    persistObservationRecord(evidenceDir, observationRecord());
    persistObservationRecord(evidenceDir, environmentRecord(), { recordId: "ENVREC-0001" });
    const indexAfter = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8"),
    ) as { objects: unknown[] };
    expect(indexAfter.objects).toEqual(indexBefore.objects);
    const blobsAfter = existsSync(blobsDir) ? collectionOf(blobsDir) : [];
    expect(blobsAfter).toEqual(blobsBefore);
    // doctor/inspect 呈现位（形态最小）：计数 2。
    expect(countObservationRecords(evidenceDir)).toBe(2);
    expect(countObservationRecords(join(root, ".pomaster", "nonexistent"))).toBe(0);
    void store;
  });
});
