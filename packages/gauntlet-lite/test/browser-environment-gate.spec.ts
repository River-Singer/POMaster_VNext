/**
 * browser-environment-gate spec —— P0.5-4b §6.7 环境身份前置门 L1 矩阵（W1-D2 批 2；
 * PRD v0.5.2 §6.7/§14 P0.5-4 + §15 Benchmark E + §16 Case H；裁决 8 ④ D4=A 判卷本体
 * 同款 gate_def 版本化路径 @0.2.0→@0.3.0）。
 *
 * 覆盖：
 * - gate_def 版本化钉住（@0.3.0 = +§6.7 环境前置门；0.2.0 绑定条款承袭）；
 * - 门矩阵：receipt 缺席（null = 实例未确认）→ blocked；doctor verdict 非 READY
 *   （Case H：expected revision != runtime revision）→ blocked + WRONG_OR_UNVERIFIED_
 *   INSTANCE/禁 PASS 词形入 scopeNote；READY + 三件套 → passed（门不过度拦截）；
 * - 门序钉死：not_configured 最先（未注册的腿无观察可言）；blocked(环境) 先于
 *   failed(连接)（null + 连接失败 → blocked）；READY 下三件套缺照旧 not_run
 *   （不被 doctor 门吞掉）——研究 perception-doctor-journey.md §5.2 T-B 次序逐字；
 * - plan.environment 回执位（prepare 注入）；
 * - browser-legs 供给面：deps.environment → kernel 判定函数消费（resolveBrowser
 *   EnvironmentReceipt）；期望面身份核五项缺失 → 该腿 blocked（编排异常通道）+
 *   playwright 腿互不牵连。
 * 全链路（persist blob → OBS 回执 → 入账）归 tests/integration/browser-legs-environment.spec.ts
 * （Benchmark E L2 形态）；READY 下三件套判卷语义与 @0.2.0 时代逐字不变由
 * browser-adapter.spec 既有矩阵钉住（全用例补 READY 回执）。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  BROWSER_GATE_DEF,
  createBrowserAdapter,
  resolveBrowserEnvironmentReceipt,
  runBrowserGateLegs,
  type BrowserEnvironmentInput,
  type BrowserLegIdentity,
  type DetectorFacts,
  type GateResultRecord,
  type GatePolicy,
} from "@pomaster/gauntlet-lite";
import {
  buildEnvironmentReceipt,
  runEnvironmentDoctor,
  type EnvironmentExpectation,
  type EnvironmentObserved,
  type EnvironmentReceipt,
} from "@pomaster/kernel";
import { fakeFacts, posixJoin } from "./helpers.js";

const ROOT = mkdtempSync(join(tmpdir(), "pomaster-browser-env-gate-"));

// I8④：模块级临时目录用后清理（此前从不删除——遗留目录随测试次数线性累积）。
afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

// ============================================================
// §6.7 夹具：kernel 判定函数真判卷（runEnvironmentDoctor → buildEnvironmentReceipt）
// ============================================================

const READY_EXPECTATION: EnvironmentExpectation = {
  repository_ref: "POMASTER_PROJECT",
  revision_ref: "d6afca3",
  build_identity: null,
  runtime_instance: "app-local-4173",
  base_url: "http://127.0.0.1:4173",
  environment_ref: "ENV.LOCAL.DEV",
  dataset_ref: null,
  auth_role: null,
  feature_flags: null,
};

function readyObserved(): EnvironmentObserved {
  return { ...READY_EXPECTATION };
}

/** READY 回执（九项确认全等——本 spec 不手拼 doctor_verdict 字段，全经 kernel 判定）。 */
function readyReceipt(executionId = "AGX-2026-00001"): EnvironmentReceipt {
  const outcome = runEnvironmentDoctor(READY_EXPECTATION, readyObserved());
  return buildEnvironmentReceipt(readyObserved(), executionId, outcome.verdict);
}

/** Case H 形态：expected revision != observed revision → WRONG_OR_UNVERIFIED_INSTANCE。 */
function wrongRevisionReceipt(): EnvironmentReceipt {
  const observed: EnvironmentObserved = { ...readyObserved(), revision_ref: "0000000" };
  const outcome = runEnvironmentDoctor(READY_EXPECTATION, observed);
  return buildEnvironmentReceipt(observed, "AGX-2026-00001", outcome.verdict);
}

/** 全 null 实测面（未确认任何身份位）→ WRONG_OR_UNVERIFIED_INSTANCE。 */
function unobservedReceipt(): EnvironmentReceipt {
  const observed: EnvironmentObserved = {
    repository_ref: null,
    revision_ref: null,
    build_identity: null,
    runtime_instance: null,
    base_url: null,
    environment_ref: null,
    dataset_ref: null,
    auth_role: null,
    feature_flags: null,
  };
  const outcome = runEnvironmentDoctor(READY_EXPECTATION, observed);
  return buildEnvironmentReceipt(observed, "AGX-2026-00001", outcome.verdict);
}

function readyEnvironmentInput(
  executionId = "AGX-2026-00001",
): BrowserEnvironmentInput {
  return { expected: READY_EXPECTATION, observed: readyObserved(), executionId };
}

// ============================================================
// 事实源（.mcp.json 注册态）与证据注入
// ============================================================

function mcpRegisteredFacts(): DetectorFacts {
  return fakeFacts(ROOT, {
    files: {
      [posixJoin(ROOT, ".mcp.json")]: JSON.stringify({
        mcpServers: {
          "chrome-devtools": { command: "npx", args: ["chrome-devtools-mcp@latest"] },
        },
      }),
    },
  });
}

function emptyFacts(): DetectorFacts {
  return fakeFacts(ROOT, { files: {} });
}

const A11Y_SNAPSHOT_TEXT =
  '## Latest page snapshot\nuid=1_0 RootWebArea "pomaster-p26-probe"\n  uid=1_1 heading "P26 MCP probe" level="1"\n  uid=1_2 button "ok"';
const PERF_TRACE_TEXT =
  "The performance trace has been stopped.\n## Summary of Performance trace findings:\nURL: data:text/html,...";

function fullEvidence(): readonly unknown[] {
  return [
    { tool: "take_snapshot", content: [{ type: "text", text: A11Y_SNAPSHOT_TEXT }] },
    {
      tool: "take_screenshot",
      content: [{ type: "image", data: "iVBORw0KGgoAAAANSUhEUg==", mimeType: "image/png" }],
    },
    { tool: "performance_stop_trace", content: [{ type: "text", text: PERF_TRACE_TEXT }] },
  ];
}

function policy(): GatePolicy {
  return { grn: "GRN-95", ranAtSeq: 95, trigger: "on_demand" };
}

/** 经注入面全链路（fake smoke + 注入证据 + 注入环境回执）。 */
function runWith(
  evidence: readonly unknown[],
  options: {
    readonly environment?: EnvironmentReceipt | null;
    readonly facts?: DetectorFacts;
    readonly connected?: boolean;
  } = {},
) {
  const wired = createBrowserAdapter({
    smokeFn: () => ({
      connected: options.connected ?? true,
      pageTitle: null,
      failureReason: null,
    }),
    mcpEvidenceProvider: () => evidence,
    environment: options.environment === undefined ? null : options.environment,
  });
  const plan = wired.prepare({ projectRoot: ROOT }, policy(), options.facts ?? mcpRegisteredFacts());
  const raw = wired.run(plan);
  const record = wired.normalize(raw, {});
  return { plan, raw, record };
}

// ============================================================
// gate_def 版本化钉住（@0.3.0 = +§6.7 环境前置门；0.2.0 绑定条款承袭）
// ============================================================

describe("gate_def 版本化（@0.2.0 → @0.3.0）", () => {
  it("BROWSER_GATE_DEF = POLICY.GATE.BROWSER@0.3.0（环境前置门进门禁判卷本体的版本化锚；0.2.0 绑定条款原样承袭）", () => {
    expect(BROWSER_GATE_DEF).toBe("POLICY.GATE.BROWSER@0.3.0");
  });
});

// ============================================================
// 门矩阵（§6.7「Verification 不得 PASS」+ Case H「Verification BLOCKED」）
// ============================================================

describe("§6.7 环境身份前置门矩阵", () => {
  it("receipt 缺席（null = 实例未确认）→ blocked + counts 全零 + 补路 scopeNote（fail-closed 一刀切）", () => {
    const { record } = runWith(fullEvidence(), { environment: null });
    expect(record.verdict).toBe("blocked");
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    expect(record.blindspot).toEqual({ scanned: 0, produced: 0, escapeRatio: 0 });
    // 三件套齐备也不放行——PRD §6.7 验收句「未确认 base URL / runtime instance 不得判 PASS」。
    expect(record.scopeNote).toContain("环境回执缺席");
    expect(record.scopeNote).toContain("WRONG_OR_UNVERIFIED_INSTANCE");
    expect(record.scopeNote).toContain("Verification 不得 PASS");
    expect(record.scopeNote).toContain("BrowserGateLegsDeps.environment");
  });

  it("Case H：expected revision != runtime revision → doctor 判 WRONG_OR_UNVERIFIED_INSTANCE → blocked（截图/三件套在场也不得 PASS）", () => {
    const { record } = runWith(fullEvidence(), { environment: wrongRevisionReceipt() });
    expect(record.verdict).toBe("blocked");
    expect(record.scopeNote).toContain("doctor_verdict=WRONG_OR_UNVERIFIED_INSTANCE");
    expect(record.scopeNote).toContain("BLOCKED");
    expect(record.scopeNote).toContain("expected revision != runtime revision");
    expect(record.scopeNote).toContain("Benchmark E");
  });

  it("实测全 null（九项均未确认）→ blocked + 未确认位逐项显式（null 显式缺席，禁占位词冒充）", () => {
    const { record } = runWith(fullEvidence(), { environment: unobservedReceipt() });
    expect(record.verdict).toBe("blocked");
    expect(record.scopeNote).toContain("doctor_verdict=WRONG_OR_UNVERIFIED_INSTANCE");
    expect(record.scopeNote).toContain("base_url");
    expect(record.scopeNote).toContain("runtime_instance");
    expect(record.scopeNote).toContain("revision_ref");
  });

  it("READY + 三件套齐备 → passed（门不过度拦截——判卷语义与 @0.2.0 时代一致）", () => {
    const { record } = runWith(fullEvidence(), { environment: readyReceipt() });
    expect(record.verdict).toBe("passed");
    expect(record.counts.violations).toBe(0);
  });

  it("READY + 三件套缺 screenshot → not_run（doctor 门不吞证据判卷——次序钉死）", () => {
    const evidence = fullEvidence().filter(
      (entry) => (entry as { tool: string }).tool !== "take_screenshot",
    );
    const { record } = runWith(evidence, { environment: readyReceipt() });
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("mcp 交互证据不完整");
  });

  it("null + 连接失败 → blocked（blocked(环境) 先于 failed(连接)——门序钉死）", () => {
    const { record } = runWith(fullEvidence(), {
      environment: null,
      connected: false,
    });
    expect(record.verdict).toBe("blocked");
    expect(record.scopeNote).toContain("环境回执缺席");
  });

  it("READY + 连接失败 → failed（连接门独立不变——READY 只开环境位，不豁免通道失败）", () => {
    const { record } = runWith(fullEvidence(), {
      environment: readyReceipt(),
      connected: false,
    });
    expect(record.verdict).toBe("failed");
    expect(record.items?.[0]?.rule).toBe("mcp_smoke_connect_failed");
  });

  it("MCP 未注册 + null 回执 → not_configured（not_configured 最先——未注册的腿无观察可言）", () => {
    const { record } = runWith([], { environment: null, facts: emptyFacts() });
    expect(record.verdict).toBe("not_configured");
    expect(record.scopeNote).toContain("安装 chrome-devtools MCP");
  });

  it("plan.environment 携带注入回执（prepare 注入位——null 与回执两形态）", () => {
    const receipt = readyReceipt();
    const withReceipt = runWith(fullEvidence(), { environment: receipt });
    expect(withReceipt.plan.environment).toBe(receipt);
    const without = runWith(fullEvidence(), { environment: null });
    expect(without.plan.environment).toBeNull();
  });
});

// ============================================================
// browser-legs 供给面（消费 kernel perception.ts 判定函数）
// ============================================================

describe("runBrowserGateLegs 环境供给面", () => {
  const LEG_IDENTITIES: readonly [BrowserLegIdentity, BrowserLegIdentity] = [
    { grn: "GRN-0001", ranAtSeq: 10 },
    { grn: "GRN-0002", ranAtSeq: 11 },
  ];

  function legsDeps(
    evidence: readonly unknown[],
    extra: { readonly environment?: BrowserEnvironmentInput | null } = {},
  ) {
    return {
      facts: mcpRegisteredFacts(),
      smokeFn: () => ({ connected: true, pageTitle: null, failureReason: null }),
      mcpEvidenceProvider: () => evidence,
      ...extra,
    };
  }

  it("deps.environment READY → 交互腿 passed（真判卷链：runEnvironmentDoctor → buildEnvironmentReceipt → plan）", () => {
    const [playwrightLeg, browserLeg] = runBrowserGateLegs(
      { projectRoot: ROOT, subjectId: null, denominatorRefs: [] },
      LEG_IDENTITIES,
      // playwright 腿无 spawn 注入——本用例同时断言交互腿判卷与 playwright 腿的
      // not_configured 缺席态（注释与断言面一致；互不牵连矩阵见下）。
      legsDeps(fullEvidence(), { environment: readyEnvironmentInput() }),
    );
    expect(playwrightLeg.verdict).toBe("not_configured");
    expect(browserLeg.verdict).toBe("passed");
  });

  it("deps.environment Case H（revision mismatch）→ 交互腿 blocked；playwright 腿互不牵连", () => {
    const [playwrightLeg, browserLeg] = runBrowserGateLegs(
      { projectRoot: ROOT, subjectId: null, denominatorRefs: [] },
      LEG_IDENTITIES,
      legsDeps(fullEvidence(), {
        environment: {
          expected: READY_EXPECTATION,
          observed: { ...readyObserved(), revision_ref: "0000000" },
          executionId: "AGX-2026-00001",
        },
      }),
    );
    expect(browserLeg.verdict).toBe("blocked");
    expect(browserLeg.scopeNote).toContain("WRONG_OR_UNVERIFIED_INSTANCE");
    expect(playwrightLeg.verdict).toBe("not_configured");
  });

  it("deps.environment 缺省（undefined）→ 交互腿 blocked（fail-closed：旧编排零环境输入即拒）", () => {
    const [, browserLeg] = runBrowserGateLegs(
      { projectRoot: ROOT, subjectId: null, denominatorRefs: [] },
      LEG_IDENTITIES,
      legsDeps(fullEvidence()),
    );
    expect(browserLeg.verdict).toBe("blocked");
    expect(browserLeg.scopeNote).toContain("环境回执缺席");
  });

  it("期望面身份核五项缺失 → kernel SCHEMA_INVALID → 该腿 blocked（编排异常通道，禁静默）", () => {
    const [, browserLeg] = runBrowserGateLegs(
      { projectRoot: ROOT, subjectId: null, denominatorRefs: [] },
      LEG_IDENTITIES,
      legsDeps(fullEvidence(), {
        environment: {
          // 判卷分母缺失：五项身份核未申报（base_url/runtime_instance 等）——
          // kernel runEnvironmentDoctor fail-closed，编排面兜成该腿 blocked。
          expected: { ...READY_EXPECTATION, repository_ref: "", revision_ref: "" },
          observed: readyObserved(),
          executionId: "AGX-2026-00001",
        },
      }),
    );
    expect(browserLeg.verdict).toBe("blocked");
    expect(browserLeg.scopeNote).toContain("编排异常");
  });

  it("resolveBrowserEnvironmentReceipt：null→null；READY 输入→READY 回执；Case H 输入→WRONG_OR_UNVERIFIED_INSTANCE 回执", () => {
    expect(resolveBrowserEnvironmentReceipt(null)).toBeNull();
    expect(resolveBrowserEnvironmentReceipt(undefined)).toBeNull();
    const ready = resolveBrowserEnvironmentReceipt(readyEnvironmentInput());
    expect(ready?.doctor_verdict).toBe("READY");
    expect(ready?.execution_id).toBe("AGX-2026-00001");
    expect(ready?.base_url).toBe("http://127.0.0.1:4173");
    const wrong = resolveBrowserEnvironmentReceipt({
      expected: READY_EXPECTATION,
      observed: { ...readyObserved(), revision_ref: "0000000" },
      executionId: "AGX-2026-00001",
    });
    expect(wrong?.doctor_verdict).toBe("WRONG_OR_UNVERIFIED_INSTANCE");
    // Case H 证据链消费位：实测 revision 原样保留（禁洗成占位值）。
    expect(wrong?.revision_ref).toBe("0000000");
  });
});

// ============================================================
// 结构性断言：blocked 记录不带 passed 面（03 schema 词形纪律）
// ============================================================

describe("blocked 记录形态（03 GateResult 纪律）", () => {
  it("环境 blocked 记录：counts 全零 + trust.asserted=null + 无 items（无 violations 主张）", () => {
    const { record }: { record: GateResultRecord } = runWith(fullEvidence(), {
      environment: wrongRevisionReceipt(),
    });
    expect(record.verdict).toBe("blocked");
    expect(record.trust.asserted).toBeNull();
    expect(record.trust.recomputed).toEqual({ violations: 0, matchesAsserted: true });
    expect(record.items).toBeUndefined();
  });
});
