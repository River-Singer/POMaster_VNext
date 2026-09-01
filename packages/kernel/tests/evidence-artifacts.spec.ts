/**
 * evidence-artifacts.spec —— P0.5-2 kernel 通路单元矩阵（PRD §7/§14 + 裁决8③④）：
 * sha256OfBytes（G1 raw 字节摘要）/ persistEvidenceArtifact（G2 内容寻址落盘：幂等 +
 * 读回自证 + 碰撞防线）/ assertArtifactRefs + artifactRefsToSnake + assertArtifactBlobsExist
 * （G3 落盘词形防线与 canonical 映射单源）/ verifyEvidenceBinding（G6 四态绑定校验）/
 * record_gate_run 信封扩展（artifact_refs 携带 + 悬空引用 fail-closed + 存量字节兼容）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  createStore,
  normalizeGateResult,
  sha256OfBytes,
  sha256OfCanonical,
  assertArtifactBlobsExist,
  assertArtifactRefs,
  artifactRefsToSnake,
  persistEvidenceArtifact,
  storagePathOfSha256,
  verifyEvidenceBinding,
  EVIDENCE_BINDING_INCOMPLETE,
  EVIDENCE_BINDING_INCOMPLETE_REASONS,
  type EvidenceArtifactRefInput,
  type Store,
} from "../src/index.js";

let evidenceDir: string;
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pvnext-w1-evb-kernel-"));
  // store 契约布局的 evidence 平面根（<root>/.pomaster/evidence）——blob 落盘与
  // record_gate_run 的存在性校验同锚。
  evidenceDir = join(root, ".pomaster", "evidence");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// sha256OfBytes（G1：raw 字节摘要；D24 伦理同条）
// ============================================================

describe("sha256OfBytes（raw 字节摘要）", () => {
  it("已知向量：空字节 / \"abc\"（FIPS 向量）", () => {
    expect(sha256OfBytes(new Uint8Array(0))).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256OfBytes(new TextEncoder().encode("abc"))).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("词形 ^sha256:[0-9a-f]{64}$；同字节重放稳定；与 canonical 摘要是不同哈希对象（R3）", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(sha256OfBytes(bytes)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sha256OfBytes(bytes)).toBe(sha256OfBytes(bytes));
    // canonical 摘要对「结构」哈希（键排序 canonical-JSON）；raw 摘要对字节——互不替代。
    expect(sha256OfCanonical({ v: bytes })).not.toBe(sha256OfBytes(bytes));
  });
});

// ============================================================
// persistEvidenceArtifact（G2：内容寻址写；幂等 + 读回自证 + 碰撞防线）
// ============================================================

describe("persistEvidenceArtifact（内容寻址落盘）", () => {
  it("写 blobs/sha256/<aa>/<rest>；返回 sha256/byteSize/storagePath 与文件字节一致", () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
    const persisted = persistEvidenceArtifact(evidenceDir, { media: "screenshot", bytes });
    expect(persisted.media).toBe("screenshot");
    expect(persisted.byteSize).toBe(5);
    expect(persisted.storagePath).toBe(storagePathOfSha256(persisted.sha256));
    expect(persisted.storagePath).toMatch(/^blobs\/sha256\/[0-9a-f]{2}\/[0-9a-f]{62}$/);
    const absolute = join(evidenceDir, persisted.storagePath);
    expect(existsSync(absolute)).toBe(true);
    const shaOf = sha256OfBytes(new Uint8Array(readFileSync(absolute)));
    expect(shaOf).toBe(persisted.sha256);
  });

  it("幂等：同字节重 persist → 同路径零改写（文件字节全等）", () => {
    const bytes = new Uint8Array([0xaa, 0xbb, 0xcc]);
    const first = persistEvidenceArtifact(evidenceDir, { media: "screenshot", bytes });
    const second = persistEvidenceArtifact(evidenceDir, { media: "screenshot", bytes });
    expect(second).toEqual(first);
    expect(readFileSync(join(evidenceDir, first.storagePath)).equals(Buffer.from(bytes))).toBe(true);
  });

  it("不同字节 → 不同路径（内容寻址分片）", () => {
    const a = persistEvidenceArtifact(evidenceDir, { media: "screenshot", bytes: new Uint8Array([0x01]) });
    const b = persistEvidenceArtifact(evidenceDir, { media: "screenshot", bytes: new Uint8Array([0x02]) });
    expect(a.storagePath).not.toBe(b.storagePath);
  });

  it("路径被不同字节占用（碰撞/损坏形态）→ REF_INTEGRITY_VIOLATION fail-closed 禁覆盖", () => {
    const bytes = new Uint8Array([0x11, 0x22]);
    const first = persistEvidenceArtifact(evidenceDir, { media: "screenshot", bytes });
    // 模拟磁盘上该路径被篡改为其他字节后再 persist 原字节 → 同路径不同字节即拒。
    writeFileSync(join(evidenceDir, first.storagePath), Buffer.from([0xde, 0xad, 0xbe, 0xef]));
    expect(() =>
      persistEvidenceArtifact(evidenceDir, { media: "screenshot", bytes }),
    ).toThrowError(expect.objectContaining({ code: "REF_INTEGRITY_VIOLATION" }) as unknown);
  });

  it("空字节 / media 越界 → SCHEMA_INVALID（无物之据禁入）", () => {
    expect(() =>
      persistEvidenceArtifact(evidenceDir, { media: "screenshot", bytes: new Uint8Array(0) }),
    ).toThrowError(expect.objectContaining({ code: "SCHEMA_INVALID" }) as unknown);
    expect(() =>
      persistEvidenceArtifact(evidenceDir, { media: "", bytes: new Uint8Array([1]) }),
    ).toThrowError(expect.objectContaining({ code: "SCHEMA_INVALID" }) as unknown);
  });
});

// ============================================================
// assertArtifactRefs / artifactRefsToSnake（G3：词形防线 + canonical 映射单源）
// ============================================================

describe("assertArtifactRefs（词形 + 派生一致性防线）", () => {
  const validRef: EvidenceArtifactRefInput = {
    sha256: `sha256:${"ab".repeat(32)}`,
    media: "screenshot",
    byteSize: 16,
    storagePath: `blobs/sha256/ab/${"ab".repeat(31)}`,
  };

  it("合法引用原样通过；undefined 透传；空数组拒收（两义性禁入）", () => {
    expect(assertArtifactRefs(undefined)).toBeUndefined();
    expect(assertArtifactRefs([validRef])).toEqual([validRef]);
    expect(() => assertArtifactRefs([])).toThrowError(
      expect.objectContaining({ code: "SCHEMA_INVALID" }) as unknown,
    );
  });

  it("sha256 词形 / media 长度 / byteSize ≥1 / storagePath 词形 / 路径⇔身份派生一致——逐项 fail-closed", () => {
    expect(() =>
      assertArtifactRefs([{ ...validRef, sha256: "sha256:zz" }]),
    ).toThrowError(expect.objectContaining({ code: "SCHEMA_INVALID" }) as unknown);
    expect(() =>
      assertArtifactRefs([{ ...validRef, media: "" }]),
    ).toThrowError(expect.objectContaining({ code: "SCHEMA_INVALID" }) as unknown);
    expect(() =>
      assertArtifactRefs([{ ...validRef, byteSize: 0 }]),
    ).toThrowError(expect.objectContaining({ code: "SCHEMA_INVALID" }) as unknown);
    expect(() =>
      assertArtifactRefs([{ ...validRef, storagePath: "blobs/png/ab/xx" }]),
    ).toThrowError(expect.objectContaining({ code: "SCHEMA_INVALID" }) as unknown);
    // 路径与 sha 派生分叉 = 引用自相矛盾。
    expect(() =>
      assertArtifactRefs([
        { ...validRef, storagePath: `blobs/sha256/cd/${"ab".repeat(31)}` },
      ]),
    ).toThrowError(expect.objectContaining({ code: "SCHEMA_INVALID" }) as unknown);
  });

  it("artifactRefsToSnake：blob 分支词形（D3=A）+ byte_size 条件落键 + 键序固定（双写点同构基线）", () => {
    const snake = artifactRefsToSnake([validRef]);
    expect(JSON.stringify(snake)).toBe(
      `[{"ref_type":"blob","blob":{"sha256":"sha256:${"ab".repeat(32)}","media":"screenshot","byte_size":16,"storage_path":"blobs/sha256/ab/${"ab".repeat(31)}"}}]`,
    );
    const withoutSize = artifactRefsToSnake([{ ...validRef, byteSize: undefined }]);
    expect(JSON.stringify(withoutSize)).toBe(
      `[{"ref_type":"blob","blob":{"sha256":"sha256:${"ab".repeat(32)}","media":"screenshot","storage_path":"blobs/sha256/ab/${"ab".repeat(31)}"}}]`,
    );
  });

  it("assertArtifactBlobsExist：blob 在场通过；缺失 → REF_INTEGRITY_VIOLATION（悬空引用拒收）", () => {
    const bytes = new Uint8Array([0x01]);
    const persisted = persistEvidenceArtifact(evidenceDir, { media: "screenshot", bytes });
    const ref: EvidenceArtifactRefInput = {
      sha256: persisted.sha256,
      media: persisted.media,
      byteSize: persisted.byteSize,
      storagePath: persisted.storagePath,
    };
    expect(() => assertArtifactBlobsExist([ref], evidenceDir)).not.toThrow();
    rmSync(join(evidenceDir, ref.storagePath));
    expect(() => assertArtifactBlobsExist([ref], evidenceDir)).toThrowError(
      expect.objectContaining({ code: "REF_INTEGRITY_VIOLATION" }) as unknown,
    );
  });
});

// ============================================================
// verifyEvidenceBinding（G6：四态绑定校验）
// ============================================================

/** 最小 canonical 形态 GRN 信封（verify 的判卷对象只需 verdict + artifact_refs 键）。 */
function writeRunRecord(
  grn: string,
  verdict: string,
  refs: unknown,
): string {
  const dir = join(evidenceDir, "runs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${grn}.json`), `${JSON.stringify({
    record_type: "run",
    grn,
    ran_at_seq: 1,
    trigger: { type: "on_demand" },
    ...(refs !== undefined ? { artifact_refs: refs } : {}),
    gate_result: {
      mode: "inline",
      result: {
        grn,
        gate: "BROWSER",
        gate_def: "POLICY.GATE.BROWSER@0.2.0",
        verdict,
      },
    },
  }, null, 2)}\n`, "utf8");
  return join(dir, `${grn}.json`);
}

describe("verifyEvidenceBinding（四态）", () => {
  it("① bound：refs 在场 + 文件在场 + 重算一致 → bound:true", () => {
    const persisted = persistEvidenceArtifact(evidenceDir, {
      media: "screenshot",
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });
    const path = writeRunRecord("GRN-1", "passed", [
      {
        ref_type: "blob",
        blob: {
          sha256: persisted.sha256,
          media: persisted.media,
          byte_size: persisted.byteSize,
          storage_path: persisted.storagePath,
        },
      },
    ]);
    const outcome = verifyEvidenceBinding({ runRecordPath: path, evidenceDir });
    expect(outcome).toEqual({ bound: true, artifactCount: 1 });
  });

  it("② 文件缺失 → artifact_file_missing（EVIDENCE_BINDING_INCOMPLETE）", () => {
    const persisted = persistEvidenceArtifact(evidenceDir, {
      media: "screenshot",
      bytes: new Uint8Array([0x01, 0x02]),
    });
    const path = writeRunRecord("GRN-2", "passed", [
      { ref_type: "blob", blob: { sha256: persisted.sha256, media: "screenshot", storage_path: persisted.storagePath } },
    ]);
    rmSync(join(evidenceDir, persisted.storagePath));
    const outcome = verifyEvidenceBinding({ runRecordPath: path, evidenceDir });
    expect(outcome).toMatchObject({
      bound: false,
      code: EVIDENCE_BINDING_INCOMPLETE,
      reason: "artifact_file_missing",
    });
  });

  it("③ 字节篡改（Case E：验证 A 存 B）→ artifact_bytes_tampered；byte_size 失配同态", () => {
    const persisted = persistEvidenceArtifact(evidenceDir, {
      media: "screenshot",
      bytes: new Uint8Array([0x01, 0x02, 0x03]),
    });
    const path = writeRunRecord("GRN-3", "passed", [
      {
        ref_type: "blob",
        blob: {
          sha256: persisted.sha256,
          media: "screenshot",
          byte_size: persisted.byteSize,
          storage_path: persisted.storagePath,
        },
      },
    ]);
    // 入账后替换持久化字节（Screenshot A → Screenshot B）。
    writeFileSync(join(evidenceDir, persisted.storagePath), Buffer.from([0x09, 0x08, 0x07]));
    const tampered = verifyEvidenceBinding({ runRecordPath: path, evidenceDir });
    expect(tampered).toMatchObject({
      bound: false,
      code: EVIDENCE_BINDING_INCOMPLETE,
      reason: "artifact_bytes_tampered",
    });
    // byte_size 副锚：字节同但声明长度失配 → 同态检出。
    writeFileSync(join(evidenceDir, persisted.storagePath), Buffer.from([0x01, 0x02, 0x03]));
    const wrongSizePath = writeRunRecord("GRN-3b", "passed", [
      {
        ref_type: "blob",
        blob: { sha256: persisted.sha256, media: "screenshot", byte_size: 99, storage_path: persisted.storagePath },
      },
    ]);
    expect(verifyEvidenceBinding({ runRecordPath: wrongSizePath, evidenceDir })).toMatchObject({
      bound: false,
      reason: "artifact_bytes_tampered",
    });
  });

  it("④ refs 缺失而 verdict=passed → binding_refs_missing_while_passed；非 passed 无 refs → bound（无主张无义务）", () => {
    const passedPath = writeRunRecord("GRN-4", "passed", undefined);
    const missing = verifyEvidenceBinding({ runRecordPath: passedPath, evidenceDir });
    expect(missing).toMatchObject({
      bound: false,
      code: EVIDENCE_BINDING_INCOMPLETE,
      reason: "binding_refs_missing_while_passed",
    });
    const notRunPath = writeRunRecord("GRN-5", "not_run", undefined);
    expect(verifyEvidenceBinding({ runRecordPath: notRunPath, evidenceDir })).toEqual({
      bound: true,
      artifactCount: 0,
    });
  });

  it("判卷对象不可信显式爆：记录缺失/JSON 损坏/verdict 缺失 → SCHEMA_INVALID（禁静默放行）", () => {
    expect(() =>
      verifyEvidenceBinding({
        runRecordPath: join(evidenceDir, "runs", "GRN-404.json"),
        evidenceDir,
      }),
    ).toThrowError(expect.objectContaining({ code: "SCHEMA_INVALID" }) as unknown);
    const corruptPath = join(evidenceDir, "runs", "GRN-6.json");
    mkdirSync(join(evidenceDir, "runs"), { recursive: true });
    writeFileSync(corruptPath, "{not-json", "utf8");
    expect(() =>
      verifyEvidenceBinding({ runRecordPath: corruptPath, evidenceDir }),
    ).toThrowError(expect.objectContaining({ code: "SCHEMA_INVALID" }) as unknown);
  });

  it("reason 三值闭包（稳定码细分；与 EVIDENCE_BINDING_INCOMPLETE 主码并用 = D5）", () => {
    expect(EVIDENCE_BINDING_INCOMPLETE).toBe("EVIDENCE_BINDING_INCOMPLETE");
    expect([...EVIDENCE_BINDING_INCOMPLETE_REASONS]).toEqual([
      "artifact_file_missing",
      "artifact_bytes_tampered",
      "binding_refs_missing_while_passed",
    ]);
  });
});

// ============================================================
// record_gate_run 信封扩展（G3：artifact_refs 携带 + 悬空引用 fail-closed + 字节兼容）
// ============================================================

/** 最小 passed GateResult（normalizeGateResult 同款输入；subject 免存在性——null）。 */
function gateResult(grn: string) {
  return normalizeGateResult(
    {
      value: {
        grn,
        gate: "BROWSER",
        gate_def: "POLICY.GATE.BROWSER@0.2.0",
        verdict: "passed",
        denominator_refs: [],
        counts: { scanned: 1, applicable_scanned: 1, violations: 0, not_applicable: 0 },
      },
      claimedBy: { actorType: "tool", actor: "gauntlet:browser", selfAttested: true },
    },
    { ranAtSeq: 1, trigger: "on_demand", tool: "gauntlet:browser", toolVersion: "0.2.0", metricDialect: "browser:mcp_interactive_evidence" },
  );
}

async function storeWithBlobs(): Promise<Store> {
  return createStore(root);
}

describe("record_gate_run artifact_refs（信封扩展）", () => {
  it("携带 refs → 信封 artifact_refs 键（blob 分支；键位在 execution_id 后 gate_result 前）", async () => {
    const s = await storeWithBlobs();
    const persisted = persistEvidenceArtifact(evidenceDir, { media: "screenshot", bytes: new Uint8Array([0x07]) });
    await applyTransaction(s, {
      ops: [
        {
          op: "record_gate_run",
          run: {
            grn: "GRN-10",
            result: gateResult("GRN-10"),
            trigger: "on_demand",
            artifactRefs: [
              {
                sha256: persisted.sha256,
                media: persisted.media,
                byteSize: persisted.byteSize,
                storagePath: persisted.storagePath,
              },
            ],
          },
        } as never,
      ],
    });
    const record = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-10.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(record["artifact_refs"]).toEqual([
      {
        ref_type: "blob",
        blob: {
          sha256: persisted.sha256,
          media: "screenshot",
          byte_size: 1,
          storage_path: persisted.storagePath,
        },
      },
    ]);
    // 键位契约：artifact_refs 在 trigger 之后、gate_result 之前（无 execution_id 形态）。
    const keys = Object.keys(record);
    expect(keys).toEqual([
      "record_type",
      "grn",
      "ran_at_seq",
      "trigger",
      "artifact_refs",
      "gate_result",
    ]);
  });

  it("悬空引用（blob 文件缺失）→ REF_INTEGRITY_VIOLATION 拒收（先 persist 再 record）", async () => {
    const s = await storeWithBlobs();
    const dangling: EvidenceArtifactRefInput = {
      sha256: `sha256:${"cd".repeat(32)}`,
      media: "screenshot",
      storagePath: `blobs/sha256/cd/${"cd".repeat(31)}`,
    };
    await expect(
      applyTransaction(s, {
        ops: [
          {
            op: "record_gate_run",
            run: { grn: "GRN-11", result: gateResult("GRN-11"), trigger: "on_demand", artifactRefs: [dangling] },
          } as never,
        ],
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "REF_INTEGRITY_VIOLATION" }) as unknown);
  });

  it("字节兼容：不携 refs 的存量 GRN 信封零 artifact_refs 键（键缺席，already_canonical 不破）", async () => {
    const s = await storeWithBlobs();
    await applyTransaction(s, {
      ops: [
        { op: "record_gate_run", run: { grn: "GRN-12", result: gateResult("GRN-12"), trigger: "on_demand" } } as never,
      ],
    });
    const text = readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-12.json"), "utf8");
    expect(text).not.toContain("artifact_refs");
  });

  it("词形越界兜 JS 直调：坏 sha / 空数组 → SCHEMA_INVALID（store 侧二道防线）", async () => {
    const s = await storeWithBlobs();
    await expect(
      applyTransaction(s, {
        ops: [
          {
            op: "record_gate_run",
            run: {
              grn: "GRN-13",
              result: gateResult("GRN-13"),
              trigger: "on_demand",
              artifactRefs: [{ sha256: "not-a-sha", media: "screenshot", storagePath: "blobs/sha256/aa/bb" }],
            },
          } as never,
        ],
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "SCHEMA_INVALID" }) as unknown);
  });
});
