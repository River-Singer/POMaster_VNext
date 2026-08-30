/**
 * projection.spec —— compileProjection（八拍③；GOLDEN-L8-3 判据）。
 * 不变量：task-agnostic POLICY 条目=0；MUST/ADVISORY 分层；每 entry 带 reason；
 * 同输入重放字节稳定；纯派生（只读，不写 store）。
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  compileProjection,
  createStore,
  issuePermit,
  resolveCatalogRoot,
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

/** 临时 catalog 副本（catalog 消费注入面；绝不改 repo 实物——§92.2 测试构造面）。 */
function makeTempCatalog(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "pomaster-projection-catalog-"));
  const catalogRoot = join(tempRoot, "catalog");
  cpSync(resolveCatalogRoot(), catalogRoot, { recursive: true });
  return catalogRoot;
}

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

  it("lazyTools：消费 catalog/tools 实存目录（P14 后非空；清单来自文件系统非自注）", async () => {
    await seedScope();
    const projection = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }],
    });
    // P14 消灭了「v0 无工具 catalog」显式空自注：清单 = catalog/tools/ 实存文件。
    expect(projection.manifest.lazyTools.length).toBeGreaterThan(0);
    expect(projection.manifest.lazyTools).toContain("tools/materialize_catalog_pilot.py");
    for (const tool of projection.manifest.lazyTools) {
      expect(tool.startsWith("tools/")).toBe(true);
    }
  });
});

// ============================================================
// catalog 策展分区（P14；§92.2 Catalog 不是第二套 Project Truth）
// ============================================================

describe("compileProjection catalog 分区（§69 步骤 12 运行时联结）", () => {
  it("frontend role：policies 按 lane 检索注入独立分区，reason 逐条标明 catalog 出处", async () => {
    const projection = await compileProjection(store, { role: "frontend" });
    expect(projection.manifest.catalogEntries.length).toBeGreaterThan(0);
    for (const entry of projection.manifest.catalogEntries) {
      expect(entry.reason.startsWith("catalog: ")).toBe(true);
      expect(entry.reason).toMatch(/^catalog: (policies|projection-presets)\//);
    }
    const client = projection.manifest.catalogEntries.find(
      (entry) => entry.ref === "POLICY.WEB.API.SINGLE_HTTP_CLIENT",
    );
    expect(client?.reason).toContain("lane=frontend");
    expect(client?.reason).toContain("enforcement=required_when_applicable");
  });

  it("projection-presets 消费：registry-tree 身份三元组进 catalog 分区（ref=preset.name）", async () => {
    const projection = await compileProjection(store, { role: "frontend" });
    const preset = projection.manifest.catalogEntries.find((entry) => entry.ref === "registry-tree");
    expect(preset?.reason).toBe(
      "catalog: projection-presets/registry-tree.yaml（projection preset，kind=projection_preset，status=DRAFT）",
    );
  });

  it("lane 检索：frontend 命中 any+frontend；backend 不见 lane=frontend 条目", async () => {
    const frontend = await compileProjection(store, { role: "frontend" });
    const backend = await compileProjection(store, { role: "backend" });
    const frontendRefs = frontend.manifest.catalogEntries.map((entry) => entry.ref);
    const backendRefs = backend.manifest.catalogEntries.map((entry) => entry.ref);
    expect(frontendRefs).toContain("POLICY.WEB.API.SINGLE_HTTP_CLIENT");
    expect(backendRefs).not.toContain("POLICY.WEB.API.SINGLE_HTTP_CLIENT");
    for (const entry of backend.manifest.catalogEntries) {
      if (!entry.reason.includes("catalog: policies/")) continue; // preset 条目无 lane 轴
      expect(entry.reason).toContain("lane=any");
    }
  });

  it("§92.2 分区分离：catalog 条目绝不混入 MUST 判卷输入（GOLDEN-L8-3 边界加固）", async () => {
    await seedScope();
    const projection = await compileProjection(store, {
      role: "frontend",
      denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }],
    });
    const catalogRefs = new Set(projection.manifest.catalogEntries.map((entry) => entry.ref));
    expect(catalogRefs.size).toBeGreaterThan(0);
    for (const entry of projection.manifest.mustEntries) {
      expect(entry.reason.startsWith("catalog:")).toBe(false);
      expect(catalogRefs.has(entry.ref)).toBe(false);
    }
  });

  it("catalogSource：status=catalog + lock 校验注记（root 不进 inputsFingerprint 输入面）", async () => {
    const projection = await compileProjection(store, { role: "frontend" });
    expect(projection.catalogSource.status).toBe("catalog");
    expect(projection.catalogSource.root).not.toBeNull();
    expect(projection.catalogSource.note).toContain("catalog-lock 校验通过");
  });

  it("catalog 缺席（注入不存在根）→ status=absent 显式呈现 + 空分区（非静默空）", async () => {
    const absentRoot = join(makeRoot(), "no-such-catalog");
    const projection = await compileProjection(store, { role: "frontend" }, {
      catalogRoot: absentRoot,
    });
    expect(projection.catalogSource.status).toBe("absent");
    expect(projection.catalogSource.note).toContain("catalog 缺席");
    expect(projection.manifest.catalogEntries).toEqual([]);
    expect(projection.manifest.lazyTools).toEqual([]);
  });

  it("§92.2 边界：catalog 变更只影响投影（catalogEntries/指纹变），store state 字节不变", async () => {
    await seedScope();
    const catalogRoot = makeTempCatalog();
    const request = { role: "frontend" as const };
    const before = await compileProjection(store, request, { catalogRoot });
    const indexPath = join(root, ".pomaster", "state", "truth-index.json");
    const stateSnapshot = readFileSync(indexPath, "utf8");

    // 改 catalog（临时副本新增一条 policy，不碰 store）。
    writeFileSync(
      join(catalogRoot, "policies", "policy.web.api.p14_probe.json"),
      `${JSON.stringify(
        {
          id: "POLICY.WEB.API.P14_PROBE",
          kind: "policy",
          classification: "LANE_POLICY",
          title_zh: "P14 探针政策",
          statement_zh: "P14 边界测试探针。",
          applies_when: { lane: "frontend", condition: "P14 边界测试" },
          enforcement: "advisory",
          axes: { lifecycle: "PROPOSED" },
          authority: { owner: "HUMAN_OWNER" },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const after = await compileProjection(store, request, { catalogRoot });
    const afterRefs = after.manifest.catalogEntries.map((entry) => entry.ref);
    expect(afterRefs).toContain("POLICY.WEB.API.P14_PROBE");
    expect(after.manifest.catalogEntries.length).toBeGreaterThan(
      before.manifest.catalogEntries.length,
    );
    expect(after.inputsFingerprint).not.toBe(before.inputsFingerprint);
    // state 零变更：catalog 改动不产生任何 store 事实（truth-index 字节全等）。
    expect(readFileSync(indexPath, "utf8")).toBe(stateSnapshot);
    rmSync(dirname(catalogRoot), { recursive: true, force: true });
  });

  it("lock 漂移 → 投影仍成功（D24 WARN 不阻断），catalogSource.note 显式漂移摘要", async () => {
    const catalogRoot = makeTempCatalog();
    const target = join(catalogRoot, "policies", "policy.web.api.single_http_client.json");
    const original = readFileSync(target, "utf8");
    // 合法 JSON 内容变更（改 statement 而非加注释）——坏 JSON 是 SCHEMA_INVALID（另一用例），漂移是内容变更。
    writeFileSync(
      target,
      original.replace("统一 HTTP Client 单点处理", "统一 HTTP Client 单点处理（漂移测试变更）"),
      "utf8",
    );
    const projection = await compileProjection(store, { role: "frontend" }, { catalogRoot });
    expect(projection.catalogSource.status).toBe("catalog");
    expect(projection.catalogSource.note).toContain("catalog-lock 漂移");
    expect(projection.manifest.catalogEntries.length).toBeGreaterThan(0);
    rmSync(dirname(catalogRoot), { recursive: true, force: true });
  });

  it("坏物料（lane 词表外）→ SCHEMA_INVALID fail-closed（坏物料 ≠ catalog 缺席）", async () => {
    const catalogRoot = makeTempCatalog();
    const target = join(catalogRoot, "policies", "policy.web.api.single_http_client.json");
    const body = JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>;
    (body["applies_when"] as Record<string, unknown>)["lane"] = "architect";
    writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    await expect(
      compileProjection(store, { role: "frontend" }, { catalogRoot }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    rmSync(dirname(catalogRoot), { recursive: true, force: true });
  });
});
