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
  explainCatalogProjection,
  issuePermit,
  loadCatalogPolicies,
  resolveCatalogRoot,
  type BaselineGroundingFacts,
  type CatalogEntryDecision,
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
  readIndex,
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

  it("许可台账损坏 fail-closed（C6）：手改 permits.json 非法 JSON → SCHEMA_INVALID（禁静默当空台账）", async () => {
    await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: pageEnvelope() as never }] });
    writeFileSync(join(root, ".pomaster", "state", "permits.json"), "{ not-json", "utf8");
    await expect(
      compileProjection(store, { role: "frontend", taskRef: "TASK.T0087" }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("许可台账结构非法（permits 非数组）→ SCHEMA_INVALID（C6：范围静默收缩 = 判卷假绿可能）", async () => {
    await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: pageEnvelope() as never }] });
    writeFileSync(
      join(root, ".pomaster", "state", "permits.json"),
      `${JSON.stringify({ version: 1, permits: "not-an-array" })}\n`,
      "utf8",
    );
    await expect(
      compileProjection(store, { role: "frontend", taskRef: "TASK.T0087" }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("许可台账畸形行取舍（C6）：缺 permit_ref 行剔除不爆，其余行照常贡献 scope（宽松字段提取，坏 JSON/结构坏形才显式爆）", async () => {
    await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: pageEnvelope() as never }] });
    writeFileSync(
      join(root, ".pomaster", "state", "permits.json"),
      `${JSON.stringify({
        version: 1,
        permits: [
          { change_ref: "TASK.T0087", scope: { subject_ids: [gid("PAGE.DASHBOARD")] } }, // 畸形：缺 permit_ref
          { permit_ref: "PERMIT.TASK.T0087.001", change_ref: "TASK.T0087", scope: { subject_ids: [gid("PAGE.DASHBOARD")] } },
        ],
      }, null, 2)}\n`,
      "utf8",
    );
    const projection = await compileProjection(store, { role: "frontend", taskRef: "TASK.T0087" });
    const entry = projection.manifest.mustEntries.find((candidate) => candidate.ref === "PAGE.DASHBOARD");
    // 规整行照常命中（许可通道不因个别畸形行失效）；理由只来自规整行 permit_ref。
    expect(entry?.reason).toContain("PERMIT.TASK.T0087.001");
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
    // W1-A2 T3 后（PRD v0.5.2 §5.2/§14；裁决 8 ②）：无输入编译下 capabilities 标注条目
    // （POLICY.WEB.API.SINGLE_HTTP_CLIENT 等 API 族）按「不可判定即不注入」排除——
    // lane 检索代表改钉 lanes 平移条目（机器判定词形）+ lane=any 回退条目（O7 旧词形实证）。
    const matrix = projection.manifest.catalogEntries.find(
      (entry) => entry.ref === "POLICY.WEB.STYLE.OWNERSHIP_MATRIX",
    );
    expect(matrix?.reason).toContain("lanes=frontend 命中 role=frontend");
    expect(matrix?.reason).toContain("enforcement=required_when_applicable");
    const fallback = projection.manifest.catalogEntries.find(
      (entry) => entry.ref === "POLICY.WEB.COPY.SUPPRESSION_LEDGER_DISCIPLINE",
    );
    expect(fallback?.reason).toContain("lane=any 命中 role=frontend");
  });

  it("projection-presets 消费：registry-tree 身份三元组进 catalog 分区（ref=preset.name）", async () => {
    const projection = await compileProjection(store, { role: "frontend" });
    const preset = projection.manifest.catalogEntries.find((entry) => entry.ref === "registry-tree");
    expect(preset?.reason).toBe(
      "catalog: projection-presets/registry-tree.yaml（projection preset，kind=projection_preset，status=DRAFT）",
    );
  });

  it("lane 检索：frontend 命中 any+frontend；backend 不见 lane=frontend 条目（B6c 起 backend 命中 any+backend——BE 协议移植物料 lane=backend 在册）", async () => {
    const frontend = await compileProjection(store, { role: "frontend" });
    const backend = await compileProjection(store, { role: "backend" });
    const frontendRefs = frontend.manifest.catalogEntries.map((entry) => entry.ref);
    const backendRefs = backend.manifest.catalogEntries.map((entry) => entry.ref);
    // W1-A2 T3 后：POLICY.WEB.API.SINGLE_HTTP_CLIENT 等 capabilities 标注条目在无输入
    // 编译下被排除（不可判定即不注入）——lane 检索钉 lanes 平移条目 OWNERSHIP_MATRIX。
    expect(frontendRefs).toContain("POLICY.WEB.STYLE.OWNERSHIP_MATRIX");
    expect(backendRefs).not.toContain("POLICY.WEB.STYLE.OWNERSHIP_MATRIX");
    for (const entry of backend.manifest.catalogEntries) {
      if (!entry.reason.includes("catalog: policies/")) continue; // preset 条目无 lane 轴
      // B6c 起 catalog 有 lane=backend 条目（BE 协议移植物料）——backend 分区命中
      // any+backend 两类词形；lane=frontend 条目仍不可见（lane 检索隔离语义不变）。
      expect(
        entry.reason.includes("lane=any") || entry.reason.includes("lane=backend"),
        entry.reason,
      ).toBe(true);
      expect(entry.reason.includes("lane=frontend"), entry.reason).toBe(false);
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

// ============================================================
// P0.5-1 结构化 applicability（PRD §5.2/§5.3/§5.4；vocab-pr-0005；裁决 8 ②）
// ============================================================

describe("compileProjection 结构化 applicability（P0.5-1 确定性过滤）", () => {
  /** 给临时副本 catalog 中的一条 policy 加机器 applicability 字段。 */
  function annotate(
    catalogRoot: string,
    policyFile: string,
    appliesWhenExtra: Record<string, unknown>,
  ): void {
    const target = join(catalogRoot, policyFile);
    const body = JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>;
    Object.assign(body["applies_when"] as Record<string, unknown>, appliesWhenExtra);
    writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  }

  it("capability 维度：frontend+CAPABILITY.PRESENTATION 不见 capabilities=[API_CONTRACT] 条目（Case B 核心语义）", async () => {
    const catalogRoot = makeTempCatalog();
    annotate(catalogRoot, "policies/policy.web.api.single_http_client.json", {
      lanes: ["frontend"],
      capabilities: ["CAPABILITY.API_CONTRACT"],
    });
    const projection = await compileProjection(
      store,
      { role: "frontend", capabilities: ["CAPABILITY.PRESENTATION"] },
      { catalogRoot },
    );
    const refs = projection.manifest.catalogEntries.map((entry) => entry.ref);
    expect(refs).not.toContain("POLICY.WEB.API.SINGLE_HTTP_CLIENT");
    // 未声明 capabilities 的条目照常注入（O7 存量行为面；W1-A2 T3 后 OWNERSHIP_MATRIX
    // 为 lanes 平移条目，无 capabilities 轴声明——capabilities 轴不参与其判定）。
    expect(refs).toContain("POLICY.WEB.STYLE.OWNERSHIP_MATRIX");
  });

  it("capability 命中：请求 capabilities 含声明值 → include 且 reason 携带命中详情（PRD §5.4 reason 保留+扩展）", async () => {
    const catalogRoot = makeTempCatalog();
    annotate(catalogRoot, "policies/policy.web.api.single_http_client.json", {
      lanes: ["frontend"],
      capabilities: ["CAPABILITY.API_CONTRACT", "CAPABILITY.REQUEST_INFRA"],
    });
    const projection = await compileProjection(
      store,
      { role: "frontend", capabilities: ["CAPABILITY.REQUEST_INFRA"] },
      { catalogRoot },
    );
    const entry = projection.manifest.catalogEntries.find(
      (candidate) => candidate.ref === "POLICY.WEB.API.SINGLE_HTTP_CLIENT",
    );
    expect(entry).toBeDefined();
    expect(entry?.reason).toContain("lanes=frontend 命中 role=frontend");
    expect(entry?.reason).toContain("capabilities 命中=CAPABILITY.REQUEST_INFRA");
    expect(entry?.reason).toContain("enforcement=required_when_applicable");
  });

  it("请求侧 capabilities 缺席：声明了 capabilities 轴的条目确定性排除（不可判定即不注入——缺席显式）", async () => {
    const catalogRoot = makeTempCatalog();
    annotate(catalogRoot, "policies/policy.web.api.single_http_client.json", {
      capabilities: ["CAPABILITY.API_CONTRACT"],
    });
    const projection = await compileProjection(store, { role: "frontend" }, { catalogRoot });
    const refs = projection.manifest.catalogEntries.map((entry) => entry.ref);
    expect(refs).not.toContain("POLICY.WEB.API.SINGLE_HTTP_CLIENT");
  });

  it("change_class 维度：声明轴未命中 → 排除；命中 → include（词形对账 PR-0005）", async () => {
    const catalogRoot = makeTempCatalog();
    annotate(catalogRoot, "policies/policy.web.style.ownership_matrix.json", {
      change_classes: ["API_EVOLUTION"],
    });
    const excluded = await compileProjection(
      store,
      { role: "frontend", changeClass: "PRESENTATION_CHANGE" },
      { catalogRoot },
    );
    expect(
      excluded.manifest.catalogEntries.map((entry) => entry.ref),
    ).not.toContain("POLICY.WEB.STYLE.OWNERSHIP_MATRIX");
    const included = await compileProjection(
      store,
      { role: "frontend", changeClass: "API_EVOLUTION" },
      { catalogRoot },
    );
    expect(
      included.manifest.catalogEntries.map((entry) => entry.ref),
    ).toContain("POLICY.WEB.STYLE.OWNERSHIP_MATRIX");
  });

  it("governance_profile 轴判卷力解除（A1 裁定 2026-09-04）：声明该轴的条目不再因档位排除，决策面以 informational 注记披露", async () => {
    const catalogRoot = makeTempCatalog();
    annotate(catalogRoot, "policies/policy.web.arch.public_api_barrel.json", {
      governance_profiles: ["STRICT"],
    });
    // A1：档位信息性——不带档位输入（请求面已无该输入位），声明 governance_profiles
    // 的条目按其余轴判定（本条目 lanes 未声明 → lane 回退命中）→ include。
    const projection = await compileProjection(
      store,
      { role: "frontend" },
      { catalogRoot },
    );
    expect(
      projection.manifest.catalogEntries.map((entry) => entry.ref),
    ).toContain("POLICY.WEB.ARCH.PUBLIC_API_BARREL");
    // explain 决策面如实披露「轴在场但判卷力解除」（informational 注记）。
    const explanation = await explainCatalogProjection(
      store,
      { role: "frontend" },
      { catalogRoot },
    );
    const decision = explanation.decisions.find(
      (d) => d.ref === "POLICY.WEB.ARCH.PUBLIC_API_BARREL",
    );
    expect(decision?.decision).toBe("included");
    expect(decision?.why_included).toContain("informational");
    expect(decision?.why_included).toContain("A1");
    rmSync(dirname(catalogRoot), { recursive: true, force: true });
  });

  it("object_kinds 维度：与范围内对象 kind 交集判定（分母通道 page_surface 命中）", async () => {
    await seedScope();
    const catalogRoot = makeTempCatalog();
    annotate(catalogRoot, "policies/policy.web.grid.column_schema_fields.json", {
      object_kinds: ["page_surface"],
    });
    const withScope = await compileProjection(
      store,
      {
        role: "frontend",
        denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }],
      },
      { catalogRoot },
    );
    // 范围内对象含 kind=page_surface（seedScope 的 PAGE.DASHBOARD）→ 命中 include。
    expect(
      withScope.manifest.catalogEntries.map((entry) => entry.ref),
    ).toContain("POLICY.WEB.GRID.COLUMN_SCHEMA_FIELDS");
    const noScope = await compileProjection(store, { role: "frontend" }, { catalogRoot });
    // 范围为空 → 不可判定即不注入（缺席显式）。
    expect(
      noScope.manifest.catalogEntries.map((entry) => entry.ref),
    ).not.toContain("POLICY.WEB.GRID.COLUMN_SCHEMA_FIELDS");
  });

  it("请求侧输入 fail-closed：changeClass 词表外、capability 词形非法 → 显式拒绝（A5 同款码位透传）", async () => {
    await expect(
      compileProjection(store, { role: "frontend", changeClass: "NOT_A_CLASS" }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    // 未知前缀 → A5 closed-world 原码透传（与 permit capabilityRefs 同款语义）。
    await expect(
      compileProjection(store, { role: "frontend", capabilities: ["BOGUS.X"] }),
    ).rejects.toMatchObject({ code: "FATAL_UNKNOWN_PREFIX" });
    // 已登记前缀但非 CAPABILITY → SCHEMA_INVALID（capabilities 轴词形约束）。
    await expect(
      compileProjection(store, { role: "frontend", capabilities: ["PAGE.DASHBOARD"] }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("O7 输入组合回归：capabilities/change_class 与本体重合时 catalogEntries 与不带输入全等（T3 后语义）", async () => {
    // W1-A2 T3 注记（2026-09-01）：本测试批1前提「真实 catalog 94 条全未标注」已消解。
    // 现语义：该输入组合（PRESENTATION + PRESENTATION_CHANGE）对 T3 标注面
    // 不产生增量命中（API 族 capabilities 无交集、PCC/API_EVOLUTION/DEPENDENCY_CHANGE
    // 条目 change_class 未命中、PRESENTATION_CHANGE 命中条目均在 knowledge/gates 分区
    // 不进 catalogEntries）——故与无输入编译全等。fallback 子集逐字节一致棘轮见
    // tests/integration/catalog-applicability-case-b.spec.ts 的 O7 describe。
    const withInput = await compileProjection(store, {
      role: "frontend",
      capabilities: ["CAPABILITY.PRESENTATION"],
      changeClass: "PRESENTATION_CHANGE",
    });
    const withoutInput = await compileProjection(store, { role: "frontend" });
    expect(withInput.manifest.catalogEntries).toEqual(withoutInput.manifest.catalogEntries);
    expect(withInput.inputsFingerprint).toBe(withoutInput.inputsFingerprint);
  });

  it("§92.2 红线回归：机器过滤不改变分区边界（catalog 条目仍不进 MUST；store state 字节不变）", async () => {
    await seedScope();
    const catalogRoot = makeTempCatalog();
    annotate(catalogRoot, "policies/policy.web.api.single_http_client.json", {
      capabilities: ["CAPABILITY.PRESENTATION"],
    });
    const indexPath = join(root, ".pomaster", "state", "truth-index.json");
    const before = readFileSync(indexPath, "utf8");
    const projection = await compileProjection(
      store,
      {
        role: "frontend",
        capabilities: ["CAPABILITY.PRESENTATION"],
        denominatorRefs: [{ id: gid("DENOMINATOR.PAGE.V1_SURFACE"), versionSeen: 1 }],
      },
      { catalogRoot },
    );
    for (const entry of projection.manifest.mustEntries) {
      expect(entry.reason.startsWith("catalog:")).toBe(false);
    }
    expect(readFileSync(indexPath, "utf8")).toBe(before);
    rmSync(dirname(catalogRoot), { recursive: true, force: true });
  });
});

describe("explainCatalogProjection（P0.5-1 决策记录面；PRD §5.4）", () => {
  function makeAnnotatedCatalog(): string {
    const catalogRoot = makeTempCatalog();
    const annotate = (policyFile: string, extra: Record<string, unknown>): void => {
      const target = join(catalogRoot, policyFile);
      const body = JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>;
      Object.assign(body["applies_when"] as Record<string, unknown>, extra);
      writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    };
    // Case B 三实体（真实条目承载）：API Compat=capabilities 轴；Layout=lane 回退代表；
    // DB Transaction 实体缺席（O9 fixture-only——集成 spec 用 fixture 条目承载）。
    annotate("policies/policy.web.api.single_http_client.json", {
      lanes: ["frontend"],
      capabilities: ["CAPABILITY.API_CONTRACT"],
    });
    return catalogRoot;
  }

  it("included/excluded 逐条 why：命中条目 why_included、未命中条目 why_excluded（缺席显式）", async () => {
    const catalogRoot = makeAnnotatedCatalog();
    const explanation = await explainCatalogProjection(
      store,
      { role: "frontend", capabilities: ["CAPABILITY.PRESENTATION"] },
      { catalogRoot },
    );
    const byId = new Map(explanation.decisions.map((d) => [d.ref, d]));
    const apiEntry = byId.get("POLICY.WEB.API.SINGLE_HTTP_CLIENT");
    expect(apiEntry?.decision).toBe("excluded");
    expect(apiEntry?.why_excluded).toContain("capabilities=[CAPABILITY.API_CONTRACT]");
    expect(apiEntry?.why_excluded).toContain("无交集");
    // excluded 决策的 matched 携带部分命中轴（lanes 命中而 capabilities 未命中）——
    // 决策记录如实呈现部分命中，不伪造全轴失败。
    expect(apiEntry?.matched).toEqual({ lanes: ["frontend"] });
    expect(apiEntry?.fallback_lane).toBe(false);

    // W1-A2 T3 后：OWNERSHIP_MATRIX 已 lanes 平移（declaresLanes=true → 机器判定词形，
    // 不再是 lane 回退代表）；lane 回退代表改钉 lane=any 未标轴条目（O7 实证面）。
    const layoutEntry = byId.get("POLICY.WEB.STYLE.OWNERSHIP_MATRIX");
    expect(layoutEntry?.decision).toBe("included");
    expect(layoutEntry?.why_included).toContain("lanes=frontend 命中 role=frontend");
    expect(layoutEntry?.why_included).toContain("机器 applicability 全字段判定通过");
    expect(layoutEntry?.fallback_lane).toBe(false);
    expect(layoutEntry?.why_excluded).toBeNull();

    const fallbackEntry = byId.get("POLICY.WEB.COPY.SUPPRESSION_LEDGER_DISCIPLINE");
    expect(fallbackEntry?.decision).toBe("included");
    expect(fallbackEntry?.why_included).toContain("lane=any 命中 role=frontend");
    expect(fallbackEntry?.why_included).toContain("lane 回退判定");
    expect(fallbackEntry?.fallback_lane).toBe(true);

    // 输入回显（判卷可重放；A1 裁定后无档位输入位）。
    expect(explanation.inputs).toEqual({
      role: "frontend",
      taskRef: null,
      capabilities: ["CAPABILITY.PRESENTATION"],
      changeClass: null,
    });
    expect(explanation.catalogSource.status).toBe("catalog");
    rmSync(dirname(catalogRoot), { recursive: true, force: true });
  });

  it("与 manifest 一致：included 决策集 = catalogEntries ref 集（同一判定核的两面）", async () => {
    const catalogRoot = makeAnnotatedCatalog();
    const request = {
      role: "frontend",
      capabilities: ["CAPABILITY.API_CONTRACT"],
    } as const;
    const [explanation, projection] = await Promise.all([
      explainCatalogProjection(store, request, { catalogRoot }),
      compileProjection(store, request, { catalogRoot }),
    ]);
    const includedRefs = explanation.decisions
      .filter((d: CatalogEntryDecision) => d.decision === "included")
      .map((d) => d.ref)
      .sort();
    const manifestRefs = projection.manifest.catalogEntries.map((e) => e.ref).sort();
    expect(includedRefs).toEqual(manifestRefs);
    rmSync(dirname(catalogRoot), { recursive: true, force: true });
  });

  it("同输入重放字节稳定（纯派生只读决策面）", async () => {
    const catalogRoot = makeAnnotatedCatalog();
    const request = { role: "frontend", capabilities: ["CAPABILITY.PRESENTATION"] } as const;
    const first = await explainCatalogProjection(store, request, { catalogRoot });
    const second = await explainCatalogProjection(store, request, { catalogRoot });
    expect(first).toEqual(second);
    rmSync(dirname(catalogRoot), { recursive: true, force: true });
  });

  it("决策记录与指纹隔离：explanation 形状无 manifest/fingerprint 面（R2 隔离纪律）", async () => {
    const catalogRoot = makeAnnotatedCatalog();
    const request = { role: "frontend", capabilities: ["CAPABILITY.PRESENTATION"] } as const;
    const explanation = await explainCatalogProjection(store, request, { catalogRoot });
    // explanation 不携带 manifest/fingerprint 面（隔离由形状封死——excluded 无通路进投影）。
    expect("manifest" in explanation).toBe(false);
    expect("inputsFingerprint" in explanation).toBe(false);
    // decisions 分母 = policies 全集 + presets（excluded 在决策面全量可解释）。
    const policyCount = loadCatalogPolicies(catalogRoot).length;
    expect(explanation.decisions.length).toBe(policyCount + 1); // +1 = registry-tree preset
    rmSync(dirname(catalogRoot), { recursive: true, force: true });
  });

  it("catalog 缺席 → 空 decisions + absent catalogSource（显式缺席，非静默空）", async () => {
    const absentRoot = join(makeRoot(), "no-such-catalog");
    const explanation = await explainCatalogProjection(
      store,
      { role: "frontend" },
      { catalogRoot: absentRoot },
    );
    expect(explanation.decisions).toEqual([]);
    expect(explanation.catalogSource.status).toBe("absent");
  });
});

// ============================================================
// 指纹正文绑定（审计 F2 修复；R-G 修复批 2026-09-06）
// 判据锚（projection.ts scopeContentRowsOf 契约注记）：范围内对象正文演进
// （rev/body_sha256 变化）必须使 inputsFingerprint 漂移；范围外无关变化不得漂移
// （最小上下文契约——禁全仓 seq 当输入）。
// ============================================================

/** R4 必备的同类扫描记录（task_object 信封强制；portability-deletability.spec 同款）。 */
const F2_CLASS_SCAN = {
  scope: "pages/**",
  hits: 0,
  fixed_count: 0,
  regression_case_ref: "GRN-F2",
};

/** task_object 信封（closeout-evidence-spec 同款轴形态；payload.intent 可替换模拟 maintain 改意图）。 */
function f2TaskEnvelope(intent: string): Record<string, unknown> {
  return {
    id: gid("TASK.F2_INTENT"),
    kind: "task_object",
    axisProfile: "task_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: "F2 审计复现任务",
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: { intent, class_scan_result: F2_CLASS_SCAN },
  };
}

describe("指纹正文绑定（审计 F2：范围内正文漂移必须 stale、范围外必须 fresh）", () => {
  it("审计 F2 复现：任务 intent 变更（rev 1→2、body_sha256 变）→ ref+reason 词形不变而指纹必变", async () => {
    await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: f2TaskEnvelope("初始意图 v1") as never }] });
    await issuePermit(store, {
      subjectIds: [gid("TASK.F2_INTENT")],
      requestedBy: HUMAN,
      changeRef: "TASK.F2_INTENT",
    });
    const request = { role: "frontend", taskRef: "TASK.F2_INTENT" };
    const before = await compileProjection(store, request);

    // maintain「修改 intent」的等价事务：upsert 同 id 新 payload（rev 1→2、store seq +1、
    // body_sha256 变——对齐审计复现 evidence/context-truth-update.json）。
    await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: f2TaskEnvelope("变更后意图 v2") as never }] });

    const rowBefore = (readIndex(root).objects as readonly Record<string, unknown>[]).find(
      (row) => row.id === "TASK.F2_INTENT",
    );
    expect(rowBefore?.rev).toBe(2); // 正文 rev 已递增（审计同款）
    const after = await compileProjection(store, request);

    // 病灶钉住：任务条目的 ref+reason 词形不变（旧指纹只看 manifest → 对此漂移全盲）。
    expect(JSON.stringify(after.manifest)).toBe(JSON.stringify(before.manifest));
    // 修复判据：正文绑定（scopeContent）使指纹必然漂移——context --check 据此判 stale。
    expect(after.inputsFingerprint).not.toBe(before.inputsFingerprint);
  });

  it("最小上下文契约负向控制：范围外无关对象正文变更 → 指纹不变（全仓 seq 推进也不入指纹）", async () => {
    await applyTransaction(store, { ops: [
      { op: "upsert_object", envelope: f2TaskEnvelope("初始意图 v1") as never },
      // 范围外对象：不在许可 scope、无分母命中、非 taskRef。
      { op: "upsert_object", envelope: pageEnvelope({ id: gid("PAGE.UNRELATED"), titleZh: "无关页" }) as never },
    ] });
    await issuePermit(store, {
      subjectIds: [gid("TASK.F2_INTENT")],
      requestedBy: HUMAN,
      changeRef: "TASK.F2_INTENT",
    });
    const request = { role: "frontend", taskRef: "TASK.F2_INTENT" };
    const before = await compileProjection(store, request);
    const seqBefore = (readIndex(root).generation as Record<string, unknown>).seq;

    // 范围外对象演进（rev 1→2、正文变化）——store seq 必然推进。
    await applyTransaction(store, { ops: [
      { op: "upsert_object", envelope: pageEnvelope({ id: gid("PAGE.UNRELATED"), titleZh: "无关页（已改）", payload: { surface: "V2" } }) as never },
    ] });

    const seqAfter = (readIndex(root).generation as Record<string, unknown>).seq;
    expect(seqAfter).toBeGreaterThan(seqBefore as number); // 证明确实发生了事务（非短路假绿）
    const after = await compileProjection(store, request);
    // 无关变更不得误伤 freshness（审计 F2 明示：不把全仓 seq 一律当输入）。
    expect(after.inputsFingerprint).toBe(before.inputsFingerprint);
  });

  it("相关 Policy 正文变更 → 指纹必变（REQUIRED POLICY 承载的治理对象在上下文嵌入时）", async () => {
    await applyTransaction(store, { ops: [
      { op: "upsert_object", envelope: f2TaskEnvelope("初始意图 v1") as never },
      // 与任务同 authority owner（BUSINESS_OWNER）→ 经治理域通道注入 REQUIRED POLICY。
      { op: "upsert_object", envelope: pageEnvelope({
        id: gid("POLICY.F2_RULE"),
        kind: "business_rule",
        axisProfile: "rule_default",
        titleZh: "F2 治理规则",
        payload: { statement_structured: { condition: "f2 v1", action: "check" }, enforcement_point: "closeout" },
      }) as never },
    ] });
    await issuePermit(store, {
      subjectIds: [gid("TASK.F2_INTENT")],
      requestedBy: HUMAN,
      changeRef: "TASK.F2_INTENT",
    });
    const request = { role: "frontend", taskRef: "TASK.F2_INTENT" };
    const before = await compileProjection(store, request);
    // 前置实证：该 Policy 确实嵌入本上下文（mustEntries 在场——「范围内」资格成立）。
    expect(before.manifest.mustEntries.some((entry) => entry.ref === "POLICY.F2_RULE")).toBe(true);

    await applyTransaction(store, { ops: [
      { op: "upsert_object", envelope: pageEnvelope({
        id: gid("POLICY.F2_RULE"),
        kind: "business_rule",
        axisProfile: "rule_default",
        titleZh: "F2 治理规则",
        payload: { statement_structured: { condition: "f2 v2（已改）", action: "check" }, enforcement_point: "closeout" },
      }) as never },
    ] });

    const after = await compileProjection(store, request);
    expect(after.inputsFingerprint).not.toBe(before.inputsFingerprint);
  });

  it("边界③：taskRef 对象无许可（无 mustEntries 承载）时正文变更 → 指纹仍变（sources/VERIFICATION 派生面）", async () => {
    await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: f2TaskEnvelope("初始意图 v1") as never }] });
    const request = { role: "frontend", taskRef: "TASK.F2_INTENT" };
    const before = await compileProjection(store, request);
    // 无许可 → 任务对象不进 mustEntries（manifest 对正文漂移盲——本用例隔离出边界③）。
    expect(before.manifest.mustEntries.some((entry) => entry.ref === "TASK.F2_INTENT")).toBe(false);

    await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: f2TaskEnvelope("变更后意图 v2") as never }] });

    const after = await compileProjection(store, request);
    expect(after.inputsFingerprint).not.toBe(before.inputsFingerprint);
  });
});

// ============================================================
// baseline grounding facts 消费（R4/design-context 批；契约锚：
// kernel projection.ts baselineGroundingEntries 头注 ADR + cli baseline-grounding.ts
// 生产者）。facts 由测试直注（kernel 不读 baseline 文件——词形解析独占在生产端）。
// ============================================================

function groundingFacts(overrides?: Partial<BaselineGroundingFacts>): BaselineGroundingFacts {
  return {
    confirmation_ref: "baseline/manifest.yaml#confirmed",
    tokens_ref: "baseline/frontend/design-tokens.yaml",
    state: "confirmed",
    at_seq: 7,
    blocking_remaining: 0,
    targets: ["baseline/frontend/stack.yaml", "baseline/backend/stack.yaml"],
    drifted_files: [],
    pending_change: null,
    ack: null,
    confirmed_digests: { "baseline/frontend/stack.yaml": `sha256:${"1".repeat(64)}` },
    current_digests: { "baseline/frontend/stack.yaml": `sha256:${"1".repeat(64)}` },
    tokens: { kind: "absent" },
    ...overrides,
  };
}

function mustRefsOf(projection: { manifest: { mustEntries: readonly { ref: string }[] } }): string[] {
  return projection.manifest.mustEntries.map((entry) => entry.ref);
}

describe("compileProjection baseline grounding facts 消费（R4/design-context）", () => {
  it("state=confirmed → 确认记录条目进 MUST（AUTHORITATIVE）；advisory 零 baseline；reason 携确认态/at_seq/digest 摘要", async () => {
    const projection = await compileProjection(store, { role: "frontend" }, {
      baselineGrounding: groundingFacts(),
    });
    const entry = projection.manifest.mustEntries.find(
      (candidate) => candidate.ref === "baseline/manifest.yaml#confirmed",
    );
    expect(entry).toBeDefined();
    expect(entry?.reason).toContain("baseline 确认态=confirmed");
    expect(entry?.reason).toContain("at_seq=7");
    expect(entry?.reason).toContain("2 文件 digest 快照一致");
    expect(entry?.reason).toContain("STALE_GROUNDING");
    expect(
      projection.manifest.advisoryEntries.some((candidate) =>
        candidate.ref.startsWith("baseline/manifest.yaml"),
      ),
    ).toBe(false);
  });

  it("三态机逐态呈现：drifted 带漂移清单、pending-change 带变更批、状态词如实（drifted 不冒充 confirmed）", async () => {
    const drifted = await compileProjection(store, { role: "frontend" }, {
      baselineGrounding: groundingFacts({
        state: "drifted",
        drifted_files: ["baseline/frontend/architecture.md"],
      }),
    });
    const driftedEntry = drifted.manifest.mustEntries.find(
      (candidate) => candidate.ref === "baseline/manifest.yaml#confirmed",
    );
    expect(driftedEntry?.reason).toContain("确认态=drifted");
    expect(driftedEntry?.reason).toContain("1 漂移：baseline/frontend/architecture.md");

    const pending = await compileProjection(store, { role: "frontend" }, {
      baselineGrounding: groundingFacts({
        state: "pending-change",
        pending_change: { change_ref: "CHANGE.C0001", batch: ["baseline/frontend/stack.yaml:css"] },
      }),
    });
    const pendingEntry = pending.manifest.mustEntries.find(
      (candidate) => candidate.ref === "baseline/manifest.yaml#confirmed",
    );
    expect(pendingEntry?.reason).toContain("确认态=pending-change");
    expect(pendingEntry?.reason).toContain("变更批在途 change_ref=CHANGE.C0001");
    expect(pendingEntry?.reason).toContain("批内 1 键");
  });

  it("state=unconfirmed → ADVISORY 注记（不冒充权威锚）；state=absent → 确认条目整体缺席（门不适用同边界）", async () => {
    const unconfirmed = await compileProjection(store, { role: "frontend" }, {
      baselineGrounding: groundingFacts({
        state: "unconfirmed",
        at_seq: null,
        confirmed_digests: null,
        blocking_remaining: 14,
      }),
    });
    expect(mustRefsOf(unconfirmed)).not.toContain("baseline/manifest.yaml#confirmed");
    const advisoryEntry = unconfirmed.manifest.advisoryEntries.find(
      (candidate) => candidate.ref === "baseline/manifest.yaml#confirmed",
    );
    expect(advisoryEntry?.reason).toContain("baseline 未确认");
    expect(advisoryEntry?.reason).toContain("阻塞 remaining=14");

    const absent = await compileProjection(store, { role: "frontend" }, {
      baselineGrounding: groundingFacts({
        state: "absent",
        at_seq: null,
        confirmed_digests: null,
        current_digests: {},
      }),
    });
    expect(
      [...absent.manifest.mustEntries, ...absent.manifest.advisoryEntries].filter(
        (candidate) => candidate.ref === "baseline/manifest.yaml#confirmed",
      ),
    ).toEqual([]);
  });

  it("tokens 三态分区映射（R3）：preset → ADVISORY 蓝图；customized+confirmed → MUST（AUTHORITATIVE）；customized 未确认 → ADVISORY", async () => {
    const presetTokens = {
      kind: "ok" as const,
      origin: "preset" as const,
      customized: false,
      groups: [
        { name: "color", keys: 13, unknown_keys: ["color.brand.secondary", "color.border.strong"] },
        { name: "spacing", keys: 7, unknown_keys: ["spacing.section_gap"] },
      ],
    };
    const preset = await compileProjection(store, { role: "frontend" }, {
      baselineGrounding: groundingFacts({ tokens: presetTokens }),
    });
    const presetEntry = preset.manifest.advisoryEntries.find(
      (candidate) => candidate.ref === "baseline/frontend/design-tokens.yaml",
    );
    expect(presetEntry?.reason).toContain("origin=preset");
    expect(presetEntry?.reason).toContain("origin=preset 蓝图 advisory");
    // UNKNOWN 键三态标注（R3）：键点径逐条呈现。
    expect(presetEntry?.reason).toContain("spacing.section_gap");
    expect(mustRefsOf(preset)).not.toContain("baseline/frontend/design-tokens.yaml");

    const customizedConfirmed = await compileProjection(store, { role: "frontend" }, {
      baselineGrounding: groundingFacts({
        tokens: { ...presetTokens, origin: "customized", customized: true },
      }),
    });
    const mustEntry = customizedConfirmed.manifest.mustEntries.find(
      (candidate) => candidate.ref === "baseline/frontend/design-tokens.yaml",
    );
    expect(mustEntry?.reason).toContain("AUTHORITATIVE 项目设计事实");

    const customizedUnconfirmed = await compileProjection(store, { role: "frontend" }, {
      baselineGrounding: groundingFacts({
        state: "unconfirmed",
        at_seq: null,
        confirmed_digests: null,
        tokens: { ...presetTokens, origin: "customized", customized: true },
      }),
    });
    expect(mustRefsOf(customizedUnconfirmed)).not.toContain(
      "baseline/frontend/design-tokens.yaml",
    );
  });

  it("tokens absent/invalid → ADVISORY 诚实呈现（缺席显式 / fail-closed 非静默当空表）；编译不炸", async () => {
    const absent = await compileProjection(store, { role: "frontend" }, {
      baselineGrounding: groundingFacts(),
    });
    const absentEntry = absent.manifest.advisoryEntries.find(
      (candidate) => candidate.ref === "baseline/frontend/design-tokens.yaml",
    );
    expect(absentEntry?.reason).toContain("design-tokens 合同缺席");

    const invalid = await compileProjection(store, { role: "frontend" }, {
      baselineGrounding: groundingFacts({
        tokens: { kind: "invalid", detail: "无法解析为 YAML（损坏或手改）" },
      }),
    });
    const invalidEntry = invalid.manifest.advisoryEntries.find(
      (candidate) => candidate.ref === "baseline/frontend/design-tokens.yaml",
    );
    expect(invalidEntry?.reason).toContain("design-tokens 合同损坏");
    expect(invalidEntry?.reason).toContain("fail-closed");
  });

  it("指纹绑定（R2）：facts 折进 inputsFingerprint——digest/状态变化必变、同 facts 重放字节稳定、options 缺席零键（既有值域不变）", async () => {
    const facts = groundingFacts();
    const first = await compileProjection(store, { role: "frontend" }, { baselineGrounding: facts });
    const second = await compileProjection(store, { role: "frontend" }, { baselineGrounding: facts });
    expect(second.inputsFingerprint).toBe(first.inputsFingerprint);

    // 任一确认资产字节漂移（current_digests 变化）→ 指纹必变。
    const drifted = await compileProjection(store, { role: "frontend" }, {
      baselineGrounding: groundingFacts({
        current_digests: { "baseline/frontend/stack.yaml": `sha256:${"2".repeat(64)}` },
      }),
    });
    expect(drifted.inputsFingerprint).not.toBe(first.inputsFingerprint);

    // 确认动作（at_seq 演进）→ 指纹必变。
    const reconfirmed = await compileProjection(store, { role: "frontend" }, {
      baselineGrounding: groundingFacts({ at_seq: 9 }),
    });
    expect(reconfirmed.inputsFingerprint).not.toBe(first.inputsFingerprint);

    // options 缺席 = 指纹输入零键——与带 grounding 的值域可区分（既有调用方值域不受影响）。
    const withoutGrounding = await compileProjection(store, { role: "frontend" });
    expect(withoutGrounding.inputsFingerprint).not.toBe(first.inputsFingerprint);
    expect(withoutGrounding.manifest.mustEntries).toEqual([]);
  });
});
