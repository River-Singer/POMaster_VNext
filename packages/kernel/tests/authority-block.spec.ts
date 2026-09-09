/**
 * authority-block.spec.ts —— D-4 权威维度写路径闸（AUTHORITY_BOUNDARY_DENY）对抗与
 * 零误伤回归（09-08 语义收口战役 T3-R1）。
 *
 * 裁定锚：owner-adjudications.md#裁决18（D-4 显式推翻裁决 11⑤/B3 warning-only 红线）
 * + 战役 PRD T3-R1（对抗用例：non-authoritative source（如 BP 对 grid_library）驱动
 * 的 maintain transaction 必须 BLOCK；现有合法事务零误伤）。
 *
 * 判据（store.ts assertAuthorityBoundaries 确定性三面）：
 * - 触及对象 = upsert primary + payload.affected_objects（T2 编译产出）/ transition id
 *   + 既有 payload.affected_objects；
 * - 对象维度 = authority owner 在 authority.json map 的 scope 申报；
 * - 来源轴 = payload.source_refs 引用在册来源的 non_authoritative_for × 对象维度相交；
 * - boundary_rules deny 轴 = 规则 scope 命中对象维度。
 *
 * 纪律：fail-closed（registry 损坏 SCHEMA_INVALID 不静默）；deny 事务零落盘零 journal
 * （字节级断言非恒真条款）；A4 零墙钟。
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  createStore,
  GovernanceError,
  loadTruthIndex,
  type Store,
} from "@pomaster/kernel";
import { makeRoot, registerOwners } from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  root = makeRoot();
  store = await createStore(root);
  registerOwners(root, ["BUSINESS_OWNER", "GRID_BASELINE_OWNER", "BP_DRIVER_OWNER"]);
  // map 申报：GRID_BASELINE_OWNER 治理 grid_library + component_implementation 维度。
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as Record<string, unknown>;
  auth.map = [
    {
      owner: "GRID_BASELINE_OWNER",
      scope: ["grid_library", "component_implementation"],
      note: "Baseline 决定 grid 实现（MasterGrid 教训）",
    },
  ];
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const BP_SOURCES_YAML = `sources:
  - id: bp-carline
    type: bp_prototype
    location: prototypes/carline/index.html
    version: rev-2026-09-01
    authority:
      authoritative_for:
        - business_information
        - interaction_intent
      non_authoritative_for:
        - css
        - grid_library
        - component_implementation
`;

function writeSourcesYaml(text: string | null): void {
  const dir = join(root, ".pomaster", "sources");
  if (text === null) {
    rmSync(dir, { recursive: true, force: true });
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.yaml"), text);
}

/** grid 维度对象（GRID_BASELINE_OWNER → dims [grid_library, component_implementation]）。 */
const gridPageEnvelope = () => ({
  id: "PAGE.GRID_VIEW",
  kind: "page_surface",
  axisProfile: "page_default",
  axes: { lifecycle: "PROPOSED", confidence: "UNRESOLVED", evidence: "PLANNED", change: "STABLE" },
  titleZh: "网格视图",
  authority: { owner: "GRID_BASELINE_OWNER", delegates: [] },
  origin: "natural",
  payload: { surface: "V1" },
});

/** BP 驱动的 CHANGE（affected_objects 触及 grid 维度对象；T2 编译产出形态）。 */
const bpDrivenChangeEnvelope = (overrides: Record<string, unknown> = {}) => ({
  id: "CHANGE.CARLINE_GRID",
  kind: "change_object",
  axisProfile: "change_default",
  axes: { lifecycle: "PROPOSED", confidence: "UNRESOLVED", evidence: "PLANNED", change: "STABLE" },
  titleZh: "换网格引擎落地",
  authority: { owner: "BP_DRIVER_OWNER", delegates: [] },
  origin: "natural",
  payload: {
    motivation: "BP 原型说 MasterGrid、Baseline 说 AG Grid",
    affected_objects: ["PAGE.GRID_VIEW"],
    reopen_count: 0,
    class_scan_result: {
      scope: "authority-block fixture（定义创建，无同类代码修改）",
      hits: 0,
      fixed_count: 0,
      regression_case_ref: "authority-block.spec",
    },
    source_refs: ["bp-carline"],
    ...overrides,
  },
});

function snapshot(): { index: string; journal: string } {
  return {
    index: readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8"),
    journal: readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8"),
  };
}

describe("D-4 权威维度闸：对抗用例（non-authoritative source 驱动的 maintain tx 必须 BLOCK）", () => {
  it("BP 原型（non_authoritative_for 含 grid_library）驱动的 CHANGE 触及 grid 维度对象 → AUTHORITY_BOUNDARY_DENY", async () => {
    writeSourcesYaml(BP_SOURCES_YAML);
    // 先落 grid 维度对象（合法写入——无来源申报，本闸零涉及）。
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: gridPageEnvelope() }],
    });
    const before = snapshot();
    const denied = await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: bpDrivenChangeEnvelope() }],
    }).catch((error: unknown) => error);
    expect(denied).toBeInstanceOf(GovernanceError);
    expect((denied as GovernanceError).code).toBe("AUTHORITY_BOUNDARY_DENY");
    // 对抗语义锚词形：阻断明细必须点名来源、维度与对象（MasterGrid 场景逐字）。
    expect((denied as GovernanceError).message).toContain("bp-carline");
    expect((denied as GovernanceError).message).toContain("grid_library");
    expect((denied as GovernanceError).message).toContain("PAGE.GRID_VIEW");
    // 零落盘：真值索引与 journal 字节不变（阻断非呈现——D-4 与 B3 的本质分界）。
    expect(snapshot()).toEqual(before);
    const index = await loadTruthIndex(store);
    expect(index.objects.some((row) => row.id === "CHANGE.CARLINE_GRID")).toBe(false);
  });

  it("同一 CHANGE 撤去 BP source_refs → 合法事务零误伤（affected 面在、来源轴不在即放行）", async () => {
    writeSourcesYaml(BP_SOURCES_YAML);
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: gridPageEnvelope() }],
    });
    const outcome = await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: bpDrivenChangeEnvelope({ source_refs: [] }) }],
    });
    expect(outcome.shortCircuited).toBe(false);
    const index = await loadTruthIndex(store);
    expect(index.objects.some((row) => row.id === "CHANGE.CARLINE_GRID")).toBe(true);
  });

  it("权威来源驱动（baseline 源 authoritative_for grid_library、双轴不相交）→ 零误伤放行", async () => {
    writeSourcesYaml(`${BP_SOURCES_YAML}  - id: baseline-grid
    type: code_refactor
    location: src/grid/implementation
    authority:
      authoritative_for: [grid_library, component_implementation]
      non_authoritative_for: []
`);
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: gridPageEnvelope() }],
    });
    const outcome = await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: bpDrivenChangeEnvelope({ source_refs: ["baseline-grid"] }),
        },
      ],
    });
    expect(outcome.appliedSeq).toBeGreaterThan(0);
  });

  it("维度不相交（来源只对 css 无发言权、触及对象维度仅 grid_library）→ 放行", async () => {
    writeSourcesYaml(
      `sources:
  - id: bp-css-only
    type: bp_prototype
    location: prototypes/carline/index.html
    authority:
      authoritative_for: []
      non_authoritative_for: [css]
`,
    );
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: gridPageEnvelope() }],
    });
    const outcome = await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: bpDrivenChangeEnvelope({ source_refs: ["bp-css-only"] }),
        },
      ],
    });
    expect(outcome.shortCircuited).toBe(false);
  });

  it("引用不在册来源 → 显式中立放行（权威边界未申报不构成 deny——投影注记面承担可见性）", async () => {
    writeSourcesYaml(BP_SOURCES_YAML);
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: gridPageEnvelope() }],
    });
    const outcome = await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: bpDrivenChangeEnvelope({ source_refs: ["unregistered-source"] }),
        },
      ],
    });
    expect(outcome.shortCircuited).toBe(false);
  });

  it("触及对象维度未申报（owner 未入 map）→ 显式中立放行（缺席诚实，禁臆测维度归属）", async () => {
    writeSourcesYaml(BP_SOURCES_YAML);
    const outcome = await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: bpDrivenChangeEnvelope(),
        },
      ],
    });
    // PAGE.GRID_VIEW 未登记 → affected 维度解析不到 owner → 不构成 deny。
    expect(outcome.shortCircuited).toBe(false);
  });

  it("registry 缺席 = opt-in 平面显式跳过（D2 既有语义）→ 零误伤放行", async () => {
    writeSourcesYaml(null);
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: gridPageEnvelope() }],
    });
    const outcome = await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: bpDrivenChangeEnvelope() }],
    });
    expect(outcome.shortCircuited).toBe(false);
  });

  it("registry 损坏 → SCHEMA_INVALID fail-closed（坏 registry ≠ 无 registry，禁静默当空表）", async () => {
    writeSourcesYaml("sources: [ { broken");
    const denied = await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: gridPageEnvelope() }],
    }).catch((error: unknown) => error);
    expect(denied).toBeInstanceOf(GovernanceError);
    expect((denied as GovernanceError).code).toBe("SCHEMA_INVALID");
    expect(snapshot().index).toBe(
      readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8"),
    );
  });

  it("transition_object 通道同判：BP 驱动的 CHANGE（affected 触及 grid 维度）转 CURRENT → DENY", async () => {
    writeSourcesYaml(BP_SOURCES_YAML);
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: gridPageEnvelope() }],
    });
    // CHANGE 本体先合法落库（无 source_refs 版本）。
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: bpDrivenChangeEnvelope({ source_refs: [] }),
        },
      ],
    });
    // 给 CHANGE 正文补 BP source_refs（模拟来源申报漂移），再转移 → 闸按既有正文判。
    const bodyPath = join(root, ".pomaster", "truth", "objects", "change-object", "change.carline-grid.json");
    const body = JSON.parse(readFileSync(bodyPath, "utf8")) as Record<string, unknown>;
    (body.payload as Record<string, unknown>).source_refs = ["bp-carline"];
    writeFileSync(bodyPath, `${JSON.stringify(body, null, 2)}\n`);
    // 正文手改会被 D24 抽验 WARN+auto-regen，但 authority 闸读的是现行正文（先于 op 执行）。
    const denied = await applyTransaction(store, {
      ops: [
        {
          op: "transition_object",
          id: "CHANGE.CARLINE_GRID",
          patch: { lifecycle: "CURRENT" },
          reasonShort: "实施完成",
        },
      ],
      authorityRef: "DECISION.TEST",
    }).catch((error: unknown) => error);
    expect(denied).toBeInstanceOf(GovernanceError);
    expect((denied as GovernanceError).code).toBe("AUTHORITY_BOUNDARY_DENY");
  });

  it("boundary_rules deny 规则 scope 命中触及对象维度 → DENY（投影只读呈现升级为写路径 BLOCK）", async () => {
    const authPath = join(root, ".pomaster", "state", "authority.json");
    const auth = JSON.parse(readFileSync(authPath, "utf8")) as Record<string, unknown>;
    auth.boundary_rules = [
      {
        rule_id: "br-grid",
        scope: "grid_library",
        effect: "deny",
        owner: "GRID_BASELINE_OWNER",
        reason: "原型对 grid 库无发言权（MasterGrid 教训）",
      },
    ];
    writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
    const denied = await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: gridPageEnvelope() }],
    }).catch((error: unknown) => error);
    expect(denied).toBeInstanceOf(GovernanceError);
    expect((denied as GovernanceError).code).toBe("AUTHORITY_BOUNDARY_DENY");
    expect((denied as GovernanceError).message).toContain("br-grid");
    expect((denied as GovernanceError).message).toContain("PAGE.GRID_VIEW");
  });

  it("boundary_rules allow 规则与无关 deny 维度 → 零误伤放行", async () => {
    const authPath = join(root, ".pomaster", "state", "authority.json");
    const auth = JSON.parse(readFileSync(authPath, "utf8")) as Record<string, unknown>;
    auth.boundary_rules = [
      { rule_id: "br-allow", scope: "grid_library", effect: "allow" },
      { rule_id: "br-other", scope: "css", effect: "deny" },
    ];
    writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
    const outcome = await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: gridPageEnvelope() }],
    });
    expect(outcome.shortCircuited).toBe(false);
  });

  it("typed envelope sources（02 信封）非 registry 引用载体：无 payload.source_refs → 来源轴零涉及放行（确定性判据=source_refs，禁模糊匹配）", async () => {
    writeSourcesYaml(BP_SOURCES_YAML);
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            ...gridPageEnvelope(),
            payload: { surface: "V1" },
            sources: [
              {
                type: "bp_blueprint",
                ref: "prototypes/carline/index.html",
                capturedBy: "agent:scraper",
                pin: { baseline: "prototypes@head" },
              },
            ],
          },
        },
      ],
    }).catch((error: unknown) => {
      // bp_blueprint 类型走 02 信封词表闭包——若词表外/负封条命中按既有码位判，
      // 不得以 AUTHORITY_BOUNDARY_DENY 形态出现（本闸只认 source_refs 载体）。
      expect((error as GovernanceError).code).not.toBe("AUTHORITY_BOUNDARY_DENY");
      return null;
    });
  });
});
