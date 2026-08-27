/**
 * projection.spec —— compileProjection（八拍③；GOLDEN-L8-3 判据）。
 * 不变量：task-agnostic POLICY 条目=0；MUST/ADVISORY 分层；每 entry 带 reason；
 * 同输入重放字节稳定；纯派生（只读，不写 store）。
 */
import { readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  compileProjection,
  createStore,
  issuePermit,
  type Store,
} from "@pomaster/kernel";
import {
  denominatorEntry,
  derivedEnvelope,
  gid,
  HUMAN,
  makeRoot,
  makeStore,
  pageEnvelope,
  producerRecord,
} from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

async function seedScope(): Promise<void> {
  await applyTransaction(store, { ops: [
    { op: "append_denominator", entry: denominatorEntry() as never },
    {
      op: "register_producer",
      record: producerRecord({
        producerId: "prod.api_requirement_compiler",
        entrypoint: "package://project/api-requirement",
        viewsMaintained: ["truth-index.envelope", "gate.input.CONTRACT"],
      }) as never,
    },
    {
      op: "upsert_object",
      envelope: pageEnvelope({
        denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }],
        authority: { owner: "FRONTEND_CONTRACT", delegates: [] },
      }) as never,
    },
    { op: "upsert_object", envelope: derivedEnvelope({ denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }] }) as never },
    {
      op: "upsert_object",
      envelope: pageEnvelope({
        id: gid("POLICY.PAGE.V1_RULES"),
        kind: "business_rule",
        axisProfile: "rule_default",
        titleZh: "V1 页面治理规则",
        authority: { owner: "FRONTEND_CONTRACT", delegates: [] },
        payload: { statement_structured: { condition: "page in V1", action: "check" }, enforcement_point: "closeout" },
      }) as never,
    },
    {
      op: "upsert_object",
      envelope: pageEnvelope({
        id: gid("POLICY.OTHER_DOMAIN.RULES"),
        kind: "business_rule",
        axisProfile: "rule_default",
        titleZh: "别域规则",
        authority: { owner: "BUSINESS_OWNER", delegates: [] },
        payload: { statement_structured: { condition: "other", action: "check" }, enforcement_point: "closeout" },
      }) as never,
    },
  ] });
}

describe("compileProjection（最小充分上下文）", () => {
  it("分母通道：范围内对象与分母锚入 MUST 区，每 entry 带 reason", async () => {
    await seedScope();
    const projection = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }],
    });
    const refs = projection.manifest.mustEntries.map((entry) => entry.ref);
    expect(refs).toContain("DENOMINATOR.PAGE.V1_SURFACE");
    expect(refs).toContain("PAGE.DASHBOARD");
    expect(refs).toContain("API_REQ.BIND.CARLINE.1");
    for (const entry of projection.manifest.mustEntries) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
    const pageEntry = projection.manifest.mustEntries.find((entry) => entry.ref === "PAGE.DASHBOARD");
    expect(pageEntry?.reason).toContain("DENOMINATOR.PAGE.V1_SURFACE@1");
  });

  it("GOLDEN-L8-3 不变量：与 task 无关的 POLICY. 条目 = 0（别域 POLICY 不注入）", async () => {
    await seedScope();
    const projection = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }],
    });
    const policyRefs = projection.manifest.mustEntries
      .map((entry) => entry.ref)
      .filter((ref) => ref.startsWith("POLICY."));
    expect(policyRefs).toEqual(["POLICY.PAGE.V1_RULES"]);
  });

  it("范围外的对象不注入（最小充分；无分母请求 → manifest 显式为空）", async () => {
    await seedScope();
    const empty = await compileProjection(store, { role: "frontend" });
    expect(empty.manifest.mustEntries).toEqual([]);
    expect(empty.manifest.advisoryEntries).toEqual([]);
  });

  it("许可通道：taskRef 命中 changeRef 的 Permit → scope 对象入 MUST（带 permit 理由）", async () => {
    await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: pageEnvelope() as never }] });
    const permit = await issuePermit(store, {
      subjectIds: [gid("PAGE.DASHBOARD")],
      requestedBy: HUMAN,
      changeRef: "TASK.T0087",
    });
    const projection = await compileProjection(store, { role: "frontend", taskRef: "TASK.T0087" });
    const entry = projection.manifest.mustEntries.find((candidate) => candidate.ref === "PAGE.DASHBOARD");
    expect(entry).toBeDefined();
    expect(entry?.reason).toContain(permit.permitRef);
  });

  it("ADVISORY 区：同 authority 域 knowledge 条目注入且注明不进 gate 判卷", async () => {
    await seedScope();
    await applyTransaction(store, { ops: [{
      op: "upsert_object",
      envelope: pageEnvelope({
        id: gid("KNOWLEDGE.GRID_PITFALLS"),
        kind: "knowledge_entry",
        axisProfile: "knowledge_default",
        titleZh: "网格陷阱经验",
        authority: { owner: "FRONTEND_CONTRACT", delegates: [] },
        payload: { failure_class: "grid", checks: ["x"] },
      }) as never,
    }] });
    const projection = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }],
    });
    const knowledge = projection.manifest.advisoryEntries.find((entry) => entry.ref === "KNOWLEDGE.GRID_PITFALLS");
    expect(knowledge?.reason).toContain("ADVISORY");
    expect(knowledge?.reason).toContain("FRONTEND_CONTRACT");
  });

  it("ADVISORY 分母漂移预警：对象钉 version_seen=1 而现行 version=2", async () => {
    await seedScope();
    await applyTransaction(store, { ops: [{
      op: "append_denominator",
      entry: denominatorEntry({ version: 2, membersCount: 3 }) as never,
    }] });
    const projection = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }],
    });
    const drift = projection.manifest.advisoryEntries.find((entry) => entry.ref === "DENOMINATOR.PAGE.V1_SURFACE");
    expect(drift?.reason).toContain("分母漂移");
    expect(drift?.reason).toContain("version=2");
  });

  it("MUST/ADVISORY 分层物理分离：MUST 条目不落入 ADVISORY（gate 判卷输入边界清晰）", async () => {
    await seedScope();
    const projection = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }],
    });
    const mustRefs = new Set(projection.manifest.mustEntries.map((entry) => entry.ref));
    for (const entry of projection.manifest.advisoryEntries) {
      expect(mustRefs.has(entry.ref)).toBe(false);
    }
  });

  it("同输入重放字节稳定：两次编译 manifest 与 inputsFingerprint 深度相等", async () => {
    await seedScope();
    const request = { role: "frontend", denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }] };
    const first = await compileProjection(store, request);
    const second = await compileProjection(store, request);
    expect(first).toEqual(second);
    expect(first.inputsFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("scope 状态变化 → fingerprint 变化（投影随真相走）", async () => {
    await seedScope();
    const request = { role: "frontend", denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }] };
    const before = await compileProjection(store, request);
    await applyTransaction(store, { ops: [{
      op: "upsert_object",
      envelope: pageEnvelope({
        id: gid("PAGE.SETTINGS"),
        titleZh: "设置",
        denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }],
        authority: { owner: "FRONTEND_CONTRACT", delegates: [] },
      }) as never,
    }] });
    const after = await compileProjection(store, request);
    expect(after.inputsFingerprint).not.toBe(before.inputsFingerprint);
    expect(after.manifest.mustEntries.length).toBeGreaterThan(before.manifest.mustEntries.length);
  });

  it("纯派生视图：compileProjection 不写 store（索引字节不变）", async () => {
    await seedScope();
    const indexPath = join(root, ".pomaster", "state", "truth-index.json");
    const before = readFileSync(indexPath, "utf8");
    const sizeBefore = statSync(indexPath).size;
    await compileProjection(store, {
      role: "frontend",
      denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }],
    });
    expect(readFileSync(indexPath, "utf8")).toBe(before);
    expect(statSync(indexPath).size).toBe(sizeBefore);
  });

  it("未初始化 store → NOT_CONFIGURED（禁静默给空投影）", async () => {
    const emptyRoot = makeRoot();
    const emptyStore = await createStore(emptyRoot);
    rmSync(join(emptyRoot, ".pomaster", "state", "truth-index.json"));
    await expect(compileProjection(emptyStore, { role: "frontend" })).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });

  it("lazyTools：v0 无工具 catalog → 显式空数组（不杜撰工具名）", async () => {
    await seedScope();
    const projection = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }],
    });
    expect(projection.manifest.lazyTools).toEqual([]);
  });
});
