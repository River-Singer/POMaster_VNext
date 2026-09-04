/**
 * catalog.spec.ts —— Engineering Catalog 共享读取器（P14 Catalog→运行时联结）三道守门：
 *
 * 1) 读取面唯一：policies/tools/projection-presets 全部经 src/catalog.ts 从 catalog/
 *    实存目录读取；lane/enforcement/classification 对账 schemas 已登记 CATALOG_* 词形
 *    （vocab-lock catalog_layer_vocab，PR-0001），词表外/必填缺失 SCHEMA_INVALID
 *    fail-closed（坏物料 ≠ catalog 缺席，禁静默当空）。
 * 2) lock 校验（D24 read-side 指纹）：repo 实物全量对账 ok——producer 写入口径
 *    sha256(utf-8 字节) 与对账端同源；entries 分母 228（policies 164/gates 6/knowledge 11/sensors 6/archetypes 41——P1-5 sensors 六条目 + P-v06 批次 1 archetypes 十条目与 GATE.NEW_ENTITY.CHECKS 登记 + P-v06 批次 2 archetypes 十二条目 + P-v06 批次 2.6 Browser Eyes：knowledge 10→11（KNOWLEDGE.WEB.BROWSER.MCP_EYES）+ P-v06 批次 3 archetypes 十七条目（Backend/API/Data，backend-references.md 2026-09-03 锚）+ P-v06 批次 4 archetypes 两条目（RUNTIME：ENVIRONMENT_PARITY/OBSERVABILITY_BINDING，runtime-references.md 2026-09-03 锚）+ B6b-I FE 播种移植物料 25 条（policies 79→104：catalog/tools/seed_b6b_frontend.py——D5 精选 22 required + 3 advisory，x-b6-porting 注记 + enforcement 轴断言）+ B6b-II FE 播种移植物料 25 条（policies 104→129：同工具 B6B-2 批——FE 24-45+index 分母，D5 上限 25/批内执行）+ B6c BE+stacks 播种移植物料 35 条（policies 129→164：catalog/tools/seed_b6c_backend.py——BE universal 分母 policy 面 25 [22 required + 3 advisory] + stacks/profile TECHNOLOGY_PROFILE 分类面 10））。
 * 3) 漂移检出：临时 catalog 副本构造 content_drift / missing / unexpected_file /
 *    lock 缺失 → 显式检出（「catalog 物料被改而 lock 未重锁」的事故通道封死）。
 * 4) 重锁计算（P-v06 批次 2.5）：relockCatalog 纯计算零写盘——漂移重算/幂等注记/
 *    扩展键保真/fail-closed 边界（临时副本上验证，repo 实物零触碰）。
 *
 * §92.2 边界注记：本模块只读 catalog/（策展源，非第二套 Project Truth）；漂移检出
 * 不修复不阻断消费（D24 write_blocking=false），修复动作 = producer 工具重锁。
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CATALOG_RELOCK_GENERATED_BY_NOTE,
  catalogRootCandidates,
  loadCatalogPolicies,
  loadCatalogProjectionPresets,
  loadCatalogTools,
  readCatalogLock,
  relockCatalog,
  resolveCatalogRoot,
  sha256OfUtf8,
  verifyCatalogLock,
} from "@pomaster/kernel";

const REPO_CATALOG = resolveCatalogRoot();

/** 临时 catalog 副本（漂移场景构造面；绝不改 repo 实物）。 */
function makeTempCatalog(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "pomaster-catalog-"));
  const catalogRoot = join(tempRoot, "catalog");
  cpSync(REPO_CATALOG, catalogRoot, { recursive: true });
  return catalogRoot;
}

let tempRoots: string[] = [];

beforeEach(() => {
  tempRoots = [];
});

afterEach(() => {
  for (const root of tempRoots) rmSync(dirname(root), { recursive: true, force: true });
});

function trackTempCatalog(): string {
  const catalogRoot = makeTempCatalog();
  tempRoots.push(catalogRoot);
  return catalogRoot;
}

// ============================================================
// 1) 读取面：定位 / lock 文档 / 物料清单
// ============================================================

describe("resolveCatalogRoot（缺省定位与显式注入）", () => {
  it("缺省定位到仓库 catalog/（实存目录；src 与 dist 同构上溯）", () => {
    expect(REPO_CATALOG.replace(/\\/g, "/").endsWith("/catalog")).toBe(true);
  });

  it("显式注入不存在的路径 → NOT_CONFIGURED（路径拼错 ≠ catalog 缺席，带路标）", () => {
    try {
      resolveCatalogRoot(join(tmpdir(), "pomaster-no-such-catalog-xyz"));
      expect.unreachable("必须抛出");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("NOT_CONFIGURED");
    }
  });

  it("候选链（C9）：仓库形态优先、包内资产兜底——<pkg>/dist/ + <pkg>/catalog/ 布局命中包内候选（npm 安装形态不再 NOT_CONFIGURED 全灭）", () => {
    const pkgRoot = mkdtempSync(join(tmpdir(), "pomaster-catalog-pkg-"));
    const pkgCatalog = join(pkgRoot, "catalog");
    mkdirSync(pkgCatalog, { recursive: true });
    mkdirSync(join(pkgRoot, "dist"), { recursive: true });
    tempRoots.push(pkgCatalog); // afterEach 删 dirname=pkgRoot 全树
    // 模拟 npm 安装形态：bundle 位于 <pkg>/dist/catalog.js（文件本体无需实存——候选
    // 解析只依赖 URL 基底）。
    const moduleUrl = pathToFileURL(join(pkgRoot, "dist", "catalog.js")).href;
    const candidates = catalogRootCandidates(moduleUrl);
    expect(candidates).toHaveLength(2);
    // 候选 1 = 仓库布局（../.. 上溯，落在包外）；候选 2 = 包内资产 <pkg>/catalog。
    expect(candidates[0]!.replace(/\\/g, "/").endsWith("/catalog")).toBe(true);
    expect(candidates[0]).not.toBe(candidates[1]);
    expect(candidates[1]).toBe(pkgCatalog);
  });

  it("候选链（C9）：两候选全缺席 → 纯函数产出的两候选均不在盘（NOT_CONFIGURED 前提形态）", () => {
    const pkgRoot = mkdtempSync(join(tmpdir(), "pomaster-catalog-empty-"));
    tempRoots.push(join(pkgRoot, "dist")); // afterEach 删 dirname=pkgRoot 全树
    const moduleUrl = pathToFileURL(join(pkgRoot, "dist", "catalog.js")).href;
    // 不创建任何 catalog 目录：全缺席场景（repo 布局上溯与包内兜底都落空）是
    // resolveCatalogRoot 显式 NOT_CONFIGURED 的前提——候选生成是纯函数，缺席判定在盘上。
    for (const candidate of catalogRootCandidates(moduleUrl)) {
      expect(existsSync(candidate)).toBe(false);
    }
  });
});

describe("readCatalogLock（lock 文档形态）", () => {
  it("版本/profile/entries 分母与排序（分母锁：228 entries，id 确定性排序；P-v06 批次 2 增量 111→123、批次 2.6 Browser Eyes 123→124、批次 3 Backend/API/Data 124→141、批次 4 RUNTIME 物料 141→143、B6b-I FE 移植 143→168、B6b-II FE 移植 168→193、B6c BE+stacks 移植 193→228）", () => {
    const lock = readCatalogLock(REPO_CATALOG);
    expect(lock.catalog_version).toBe("0.1.0-pilot");
    expect(lock.profile).toBe("web-standard@0");
    expect(lock.entries.length).toBe(228);
    expect(lock.controlled_children.allowed.length).toBe(228);
    expect(lock.controlled_children.required.length).toBe(228);
    const sorted = [...lock.entries].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(lock.entries).toEqual(sorted);
  });

  it("entries 哈希词形统一 sha256:<64hex>；source_ref 非空（provenance 纪律）", () => {
    for (const entry of readCatalogLock(REPO_CATALOG).entries) {
      expect(entry.content_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(entry.source_ref.length).toBeGreaterThan(0);
    }
  });
});

describe("loadCatalogPolicies（policies 物料读取）", () => {
  it("分母锁：164 条（authority.* 与 policy.* 同为 kind=policy；B6b-I FE 移植 +25：79→104；B6b-II FE 移植 +25：104→129；B6c BE+stacks 移植 +35：129→164——policy 面 25 + TECHNOLOGY_PROFILE 面 10）", () => {
    expect(loadCatalogPolicies(REPO_CATALOG).length).toBe(164);
  });

  it("抽查正文策展字段（单条 HTTP Client 政策逐字段对账物料原文）", () => {
    const policy = loadCatalogPolicies(REPO_CATALOG).find(
      (candidate) => candidate.id === "POLICY.WEB.API.SINGLE_HTTP_CLIENT",
    );
    expect(policy).toBeDefined();
    expect(policy?.file).toBe("policies/policy.web.api.single_http_client.json");
    expect(policy?.titleZh).toBe("HTTP Client 单点统一");
    expect(policy?.lane).toBe("frontend");
    expect(policy?.enforcement).toBe("required_when_applicable");
    expect(policy?.lifecycle).toBe("PROPOSED");
    expect(policy?.classification).toBe("LANE_POLICY");
  });

  it("lane 分布对账（any 109 / frontend 44 / backend 11；与 vocab-lock V7 词形一致；B6b-I 25 条 lane=any：43→68；B6b-II 25 条 any 17 / frontend 8：68→85、36→44；B6c 35 条 any 24 / backend 11：85→109、0→11）", () => {
    const policies = loadCatalogPolicies(REPO_CATALOG);
    expect(policies.filter((p) => p.lane === "any").length).toBe(109);
    expect(policies.filter((p) => p.lane === "frontend").length).toBe(44);
    expect(policies.filter((p) => p.lane === "backend").length).toBe(11);
  });

  it("坏物料 fail-closed：lane 词表外 → SCHEMA_INVALID（禁静默跳过当空）", () => {
    const catalogRoot = trackTempCatalog();
    const target = join(catalogRoot, "policies", "policy.web.api.single_http_client.json");
    const body = JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>;
    const appliesWhen = body["applies_when"] as Record<string, unknown>;
    appliesWhen["lane"] = "architect"; // 词表外值（V7 闭包：any/frontend/backend）
    writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    try {
      loadCatalogPolicies(catalogRoot);
      expect.unreachable("必须抛出");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("SCHEMA_INVALID");
      expect((error as Error).message).toContain("lane 词表外");
    }
  });
});

// ============================================================
// P0.5-1 机器 applicability 字段解析（vocab-pr-0005；PRD §5.2；裁决 8 ②）
// ============================================================

describe("loadCatalogPolicies 机器 applicability 字段（P0.5-1）", () => {
  /**
   * 取一条真实 policy、改写其 applies_when（临时副本内，绝不改 repo 实物）。
   * W1-A2 T3 注记（2026-09-01）：T3 标注战役后真实条目已带机器字段（lanes/capabilities/
   * applicability_note）——模拟「未声明机器字段」需先剥离（stripMachineAxes），
   * 否则本块前提（干净 applies_when）不成立。
   */
  function withAppliesWhen(
    mutate: (appliesWhen: Record<string, unknown>) => void,
  ): ReturnType<typeof loadCatalogPolicies> {
    const catalogRoot = trackTempCatalog();
    const target = join(catalogRoot, "policies", "policy.web.api.single_http_client.json");
    const body = JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>;
    mutate(body["applies_when"] as Record<string, unknown>);
    writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    return loadCatalogPolicies(catalogRoot).find(
      (candidate) => candidate.id === "POLICY.WEB.API.SINGLE_HTTP_CLIENT",
    )!;
  }

  /** 剥离 T3 标注的机器 applicability 字段（临时副本内）——回退到「未声明」前提。 */
  function stripMachineAxes(appliesWhen: Record<string, unknown>): void {
    delete appliesWhen["lanes"];
    delete appliesWhen["capabilities"];
    delete appliesWhen["change_classes"];
    delete appliesWhen["governance_profiles"];
    delete appliesWhen["object_kinds"];
    delete appliesWhen["applicability_note"];
    delete appliesWhen["risk_at_least"];
    delete appliesWhen["technologies"];
  }

  it("未声明机器字段：hasMachineApplicability=false + lanes 双读回退 [lane]（O7 行为零变化）", () => {
    const policy = withAppliesWhen(stripMachineAxes);
    expect(policy.hasMachineApplicability).toBe(false);
    expect(policy.declaresLanes).toBe(false);
    expect(policy.lanes).toEqual(["frontend"]);
    expect(policy.capabilities).toEqual([]);
    expect(policy.changeClasses).toEqual([]);
    expect(policy.governanceProfiles).toEqual([]);
    expect(policy.objectKinds).toEqual([]);
    expect(policy.declaredUnregisteredAxes).toEqual([]);
    // applicability_note 回退 condition 原文（PRD §5.2 降级位）。
    expect(policy.applicabilityNote).toBe("构建请求基础设施");
  });

  it("lanes 复数在场：双读取数组；capabilities CAPABILITY.* governed id 解析", () => {
    const policy = withAppliesWhen((appliesWhen) => {
      appliesWhen["lanes"] = ["frontend", "backend"];
      appliesWhen["capabilities"] = ["CAPABILITY.API_CONTRACT"];
    });
    expect(policy.declaresLanes).toBe(true);
    expect(policy.lanes).toEqual(["frontend", "backend"]);
    expect(policy.capabilities).toEqual(["CAPABILITY.API_CONTRACT"]);
    expect(policy.hasMachineApplicability).toBe(true);
  });

  it("change_classes/governance_profiles/object_kinds 解析（PR-0005 词轴 + truth_bodies 复用）", () => {
    const policy = withAppliesWhen((appliesWhen) => {
      appliesWhen["change_classes"] = ["API_EVOLUTION"];
      appliesWhen["governance_profiles"] = ["STANDARD", "STRICT"];
      appliesWhen["object_kinds"] = ["page_surface", "capability"];
    });
    expect(policy.changeClasses).toEqual(["API_EVOLUTION"]);
    expect(policy.governanceProfiles).toEqual(["STANDARD", "STRICT"]);
    expect(policy.objectKinds).toEqual(["page_surface", "capability"]);
  });

  it("applicability_note 在场：优先于 condition（自然语言降级位，PRD §5.2）", () => {
    const policy = withAppliesWhen((appliesWhen) => {
      stripMachineAxes(appliesWhen); // W1-A2 T3：先剥离真实条目的机器字段，隔离 note 单变量
      appliesWhen["applicability_note"] = "仅当构建请求基础设施时（人工复核注记）";
    });
    expect(policy.applicabilityNote).toBe("仅当构建请求基础设施时（人工复核注记）");
    expect(policy.appliesWhenCondition).toBe("构建请求基础设施");
    expect(policy.hasMachineApplicability).toBe(false); // note 不算机器字段（禁自然语言路由）
  });

  it("risk_at_least/technologies 留位不登记（O4）：只检存在不解析值 + not_configured 呈现位", () => {
    const policy = withAppliesWhen((appliesWhen) => {
      stripMachineAxes(appliesWhen); // W1-A2 T3：先剥离真实条目的机器字段，隔离留位轴单变量
      appliesWhen["risk_at_least"] = "任意值——本增量不解析";
      appliesWhen["technologies"] = ["react"];
    });
    expect(policy.hasMachineApplicability).toBe(false); // 不触发机器判定（词轴未登记）
    expect(policy.declaredUnregisteredAxes).toEqual(["risk_at_least", "technologies"]);
  });

  it("fail-closed：lanes 词表外 → SCHEMA_INVALID", () => {
    try {
      withAppliesWhen((appliesWhen) => { appliesWhen["lanes"] = ["architect"]; });
      expect.unreachable("必须抛出");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("SCHEMA_INVALID");
      expect((error as Error).message).toContain("lanes 词表外");
    }
  });

  it("fail-closed：capabilities 非 CAPABILITY 前缀 governed id → SCHEMA_INVALID（A5 同款）", () => {
    try {
      withAppliesWhen((appliesWhen) => { appliesWhen["capabilities"] = ["PAGE.DASHBOARD"]; });
      expect.unreachable("必须抛出");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("SCHEMA_INVALID");
      expect((error as Error).message).toContain("前缀非 CAPABILITY");
    }
  });

  it("fail-closed：capabilities 词形非法（未知前缀）→ FATAL_UNKNOWN_PREFIX 透传", () => {
    try {
      withAppliesWhen((appliesWhen) => { appliesWhen["capabilities"] = ["BOGUS.X"]; });
      expect.unreachable("必须抛出");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("FATAL_UNKNOWN_PREFIX");
    }
  });

  it("fail-closed：change_classes / governance_profiles / object_kinds 词表外 → SCHEMA_INVALID", () => {
    const cases: [string, unknown][] = [
      ["change_classes", ["NOT_A_CLASS"]],
      ["governance_profiles", ["CRITICAL"]], // O2 裁决：CRITICAL 不入（禁双词表）
      ["object_kinds", ["denominator"]], // truth_bodies 十类之外
    ];
    for (const [axis, value] of cases) {
      try {
        withAppliesWhen((appliesWhen) => { appliesWhen[axis] = value; });
        expect.unreachable(`${axis} 必须抛出`);
      } catch (error) {
        expect((error as { code?: string }).code).toBe("SCHEMA_INVALID");
        expect((error as Error).message).toContain(axis);
      }
    }
  });

  it("fail-closed：机器字段非数组形状 → SCHEMA_INVALID（禁静默当缺席）", () => {
    try {
      withAppliesWhen((appliesWhen) => { appliesWhen["capabilities"] = "CAPABILITY.API_CONTRACT"; });
      expect.unreachable("必须抛出");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("SCHEMA_INVALID");
      expect((error as Error).message).toContain("须为数组");
    }
  });
});

describe("loadCatalogTools / loadCatalogProjectionPresets", () => {
  it("tools 消费：10 份实存工具（懒加载清单分母；P-v06 批次 2 增量 5→6、批次 3 增量 6→7、批次 4 增量 7→8、B6b-I 移植工具 8→9、B6c BE 移植工具 9→10）", () => {
    const tools = loadCatalogTools(REPO_CATALOG);
    expect(tools.map((tool) => tool.file).sort()).toEqual([
      "tools/apply_human_review_pilot_0001.py",
      "tools/materialize_batch4_uplift.py",
      "tools/materialize_catalog_pilot.py",
      "tools/materialize_v06_relock.py",
      "tools/seed_b6b_frontend.py",
      "tools/seed_b6c_backend.py",
      "tools/seed_v06_archetypes.py",
      "tools/seed_v06_batch2_materials.py",
      "tools/seed_v06_batch3_materials.py",
      "tools/seed_v06_batch4_materials.py",
    ]);
  });

  it("projection-presets 消费：registry-tree 身份三元组（name/kind/status）", () => {
    const presets = loadCatalogProjectionPresets(REPO_CATALOG);
    expect(presets).toEqual([
      {
        file: "projection-presets/registry-tree.yaml",
        name: "registry-tree",
        kind: "projection_preset",
        status: "DRAFT",
      },
    ]);
  });
});

// ============================================================
// 2) lock 校验：repo 实物全量对账
// ============================================================

describe("verifyCatalogLock（repo 实物：producer 与对账端同口径）", () => {
  it("全量对账 ok：228 entries 哈希 + 管辖面双向对账零漂移（P-v06 批次 2 增量 111→123、批次 2.6 Browser Eyes 123→124、批次 3 Backend/API/Data 124→141、批次 4 RUNTIME 物料 141→143、B6b-I FE 移植 143→168、B6b-II FE 移植 168→193、B6c BE+stacks 移植 193→228）", () => {
    const verification = verifyCatalogLock(REPO_CATALOG);
    expect(verification).toEqual({ ok: true, entries_checked: 228, drifts: [] });
  });
});

// ============================================================
// 3) 漂移检出（临时副本构造，绝不改 repo 实物）
// ============================================================

describe("verifyCatalogLock（漂移场景：物料被改而 lock 未重锁 → 显式检出）", () => {
  it("content_drift：改一个 policy 字节不重锁 → 精确指向该文件", () => {
    const catalogRoot = trackTempCatalog();
    const target = join(catalogRoot, "policies", "policy.web.api.single_http_client.json");
    const original = readFileSync(target, "utf8");
    writeFileSync(target, `${original}\n<!-- tampered -->\n`, "utf8");
    const verification = verifyCatalogLock(catalogRoot);
    expect(verification.ok).toBe(false);
    const drift = verification.drifts.find((candidate) => candidate.kind === "content_drift");
    expect(drift?.path).toBe("policies/policy.web.api.single_http_client.json");
    expect(drift?.detail).toContain("物料被改而 lock 未重锁");
  });

  it("missing + missing_required：删 required 管辖文件 → 双面检出", () => {
    const catalogRoot = trackTempCatalog();
    unlinkSync(join(catalogRoot, "policies", "policy.web.api.single_http_client.json"));
    const verification = verifyCatalogLock(catalogRoot);
    expect(verification.ok).toBe(false);
    expect(verification.drifts.map((drift) => drift.kind)).toContain("missing");
    expect(verification.drifts.map((drift) => drift.kind)).toContain("missing_required");
  });

  it("unexpected_file：管辖目录新增未登记文件 → 检出（allowed+required 双登记纪律）", () => {
    const catalogRoot = trackTempCatalog();
    writeFileSync(
      join(catalogRoot, "policies", "policy.foreign.rogue.json"),
      "{}\n",
      "utf8",
    );
    const verification = verifyCatalogLock(catalogRoot);
    const drift = verification.drifts.find((candidate) => candidate.kind === "unexpected_file");
    expect(drift?.path).toBe("policies/policy.foreign.rogue.json");
    expect(drift?.detail).toContain("allowed");
  });

  it("lock 缺失 → lock_unreadable（不抛异常，结构化漂移行呈现）", () => {
    const catalogRoot = trackTempCatalog();
    unlinkSync(join(catalogRoot, "catalog-lock.draft.json"));
    const verification = verifyCatalogLock(catalogRoot);
    expect(verification.ok).toBe(false);
    expect(verification.drifts).toEqual([
      expect.objectContaining({ kind: "lock_unreadable", path: "catalog-lock.draft.json" }),
    ]);
  });

  it("手动恢复字节（等价重锁语义）→ 校验回绿（漂移可修复性）", () => {
    const catalogRoot = trackTempCatalog();
    const target = join(catalogRoot, "policies", "policy.web.api.single_http_client.json");
    const original = readFileSync(target, "utf8");
    writeFileSync(target, `${original}\n<!-- tampered -->\n`, "utf8");
    expect(verifyCatalogLock(catalogRoot).ok).toBe(false);
    writeFileSync(target, original, "utf8");
    expect(verifyCatalogLock(catalogRoot).ok).toBe(true);
  });
});

describe("sha256OfUtf8（lock 同口径哈希）", () => {
  it("与 producer 写入口径一致（sha256(utf-8 字节)，词形 sha256:<64hex>）", () => {
    const lock = readCatalogLock(REPO_CATALOG);
    const entry = lock.entries.find(
      (candidate) => candidate.id === "POLICY.WEB.API.SINGLE_HTTP_CLIENT",
    );
    expect(entry).toBeDefined();
    const raw = readFileSync(join(REPO_CATALOG, entry?.path ?? ""), "utf8");
    expect(sha256OfUtf8(raw)).toBe(entry?.content_sha256);
  });
});

// ============================================================
// 4) relockCatalog（重锁计算：纯函数返回 next，零写盘；P-v06 批次 2.5）
// ============================================================

describe("relockCatalog（重锁计算：纯计算零写盘，Owner 裁决 2026-09-03）", () => {
  it("漂移重算：next.entries 哈希 = 落盘实际字节；refreshed 精确指路；previous 与磁盘 lock 字节零触碰", () => {
    const catalogRoot = trackTempCatalog();
    const lockPath = join(catalogRoot, "catalog-lock.draft.json");
    const target = join(catalogRoot, "archetypes", "archetype.page.master_data.json");
    const original = readFileSync(target, "utf8");
    const lockBefore = readFileSync(lockPath, "utf8");
    writeFileSync(target, `${original}\n`, "utf8");
    const report = relockCatalog(catalogRoot);
    expect(report.added).toEqual([]);
    expect(report.removed).toEqual([]);
    expect(report.refreshed).toEqual(["archetypes/archetype.page.master_data.json"]);
    const entry = report.next.entries.find(
      (candidate) => candidate.path === "archetypes/archetype.page.master_data.json",
    );
    expect(entry?.content_sha256).toBe(sha256OfUtf8(readFileSync(target, "utf8")));
    expect(report.next.entries).toHaveLength(228);
    expect(report.previous.entries).toHaveLength(228);
    expect(report.next.catalog_version).toBe(report.previous.catalog_version);
    // 纯计算零写盘：lock 磁盘字节零变化（落盘归 CLI 层，分层纪律同 status/explain）。
    expect(readFileSync(lockPath, "utf8")).toBe(lockBefore);
  });

  it("generated_by 幂等注记：首锁追加、再锁不重复；同物料两次重锁 next 字节全等（A4 无时戳）", () => {
    const catalogRoot = trackTempCatalog();
    const lockPath = join(catalogRoot, "catalog-lock.draft.json");
    const first = relockCatalog(catalogRoot);
    expect(first.next.generated_by).toContain(CATALOG_RELOCK_GENERATED_BY_NOTE);
    expect(first.next.generated_by).toContain("materialize_catalog_pilot.py");
    const firstBytes = `${JSON.stringify(first.next, null, 2)}\n`;
    writeFileSync(lockPath, firstBytes, "utf8");
    const second = relockCatalog(catalogRoot);
    expect(second.added).toEqual([]);
    expect(second.removed).toEqual([]);
    expect(second.refreshed).toEqual([]);
    expect(second.next.generated_by).toBe(first.next.generated_by);
    expect(`${JSON.stringify(second.next, null, 2)}\n`).toBe(firstBytes);
    expect(readFileSync(lockPath, "utf8")).toBe(firstBytes);
  });

  it("扩展键原样保留：x-digest-ethics/note 原值 + 键序沿原 lock 文件（落盘保真前提）", () => {
    const catalogRoot = trackTempCatalog();
    const rawBefore = JSON.parse(
      readFileSync(join(catalogRoot, "catalog-lock.draft.json"), "utf8"),
    ) as Record<string, unknown>;
    const report = relockCatalog(catalogRoot);
    expect(report.next["x-digest-ethics"]).toEqual(rawBefore["x-digest-ethics"]);
    expect(report.next["note"]).toBe(rawBefore["note"]);
    expect(Object.keys(report.next)).toEqual(Object.keys(rawBefore));
    expect(report.next.profile).toBe(rawBefore["profile"]);
  });

  it("收敛：新增物料进 next（added + source_ref 确定性缺省）；删除物料出 next（removed）", () => {
    const catalogRoot = trackTempCatalog();
    const lockPath = join(catalogRoot, "catalog-lock.draft.json");
    writeFileSync(
      join(catalogRoot, "knowledge", "knowledge.relock.probe.json"),
      `${JSON.stringify({ id: "KNOWLEDGE.RELOCK.PROBE" }, null, 2)}\n`,
      "utf8",
    );
    const added = relockCatalog(catalogRoot);
    expect(added.added).toEqual(["knowledge/knowledge.relock.probe.json"]);
    expect(added.removed).toEqual([]);
    // diff 互斥（分母「两侧都在」）：新增路径不计入 refreshed（否则 CLI 呈现 +/~ 双标）。
    expect(added.refreshed).toEqual([]);
    expect(added.next.entries).toHaveLength(229);
    expect(added.next.controlled_children.allowed).toHaveLength(229);
    expect(added.next.controlled_children.required).toHaveLength(229);
    const probe = added.next.entries.find(
      (candidate) => candidate.id === "KNOWLEDGE.RELOCK.PROBE",
    );
    expect(probe?.source_ref).toBe("package://catalog/knowledge/knowledge.relock.probe.json");
    // relock 纯计算零写盘：removed 的 previous 分母来自盘上 lock——先模拟 CLI 落盘步，
    // 再删文件重算（previous 含该条目 → removed 检出）。
    writeFileSync(lockPath, `${JSON.stringify(added.next, null, 2)}\n`, "utf8");
    unlinkSync(join(catalogRoot, "knowledge", "knowledge.relock.probe.json"));
    const removed = relockCatalog(catalogRoot);
    expect(removed.removed).toEqual(["knowledge/knowledge.relock.probe.json"]);
    expect(removed.added).toEqual([]);
    expect(removed.next.entries).toHaveLength(228);
    expect(removed.next.controlled_children.allowed).toHaveLength(228);
    expect(removed.next.controlled_children.required).toHaveLength(228);
  });

  it("fail-closed：物料缺 id → SCHEMA_INVALID；lock 缺失 → NOT_CONFIGURED（relock 不是初始化工具）", () => {
    const catalogRoot = trackTempCatalog();
    writeFileSync(join(catalogRoot, "knowledge", "knowledge.no-id.json"), "{}\n", "utf8");
    try {
      relockCatalog(catalogRoot);
      expect.unreachable("必须抛出");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("SCHEMA_INVALID");
      expect((error as Error).message).toContain("knowledge/knowledge.no-id.json");
    }
    unlinkSync(join(catalogRoot, "knowledge", "knowledge.no-id.json"));
    unlinkSync(join(catalogRoot, "catalog-lock.draft.json"));
    try {
      relockCatalog(catalogRoot);
      expect.unreachable("必须抛出");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("NOT_CONFIGURED");
      expect((error as Error).message).toContain("catalog-lock 缺失");
    }
  });

  it("fail-closed：id 跨节重复 → SCHEMA_INVALID（身份面禁重复，loadCatalogSensors 同法）", () => {
    const catalogRoot = trackTempCatalog();
    writeFileSync(
      join(catalogRoot, "knowledge", "knowledge.dup.id.json"),
      `${JSON.stringify({ id: "GATE.BE.API.CONTRACT_CHECKS" }, null, 2)}\n`,
      "utf8",
    );
    try {
      relockCatalog(catalogRoot);
      expect.unreachable("必须抛出");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("SCHEMA_INVALID");
      expect((error as Error).message).toContain("跨节重复");
    }
  });
});
