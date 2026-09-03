/**
 * browser-legs-e2e.spec.ts —— P26 出口判据 E2E（tests/integration，L2 账）：
 *
 * ① BROWSER 双通道两条 GRN 独立入账 truth-index：runBrowserGateLegs 双腿真判卷
 *    （fake spawn × fake smoke × 真实 adapter 归一 + 编排方注入的 MCP 证据面）
 *    产出「playwright
 *    红（console 违规）+ MCP 交互腿绿（三件套齐备）」两记录 → 逐条过 kernel
 *    normalizeGateResult 判卷复算（P12c 假绿封死边界同款）→ 单事务两条
 *    record_gate_run 入账 → evidence/runs/ 恰好两个 GRN 文件、verdict 互异、
 *    tool/metric_dialect 随腿区分（出口判据 1：判定链真实走通）；
 * ② 无聚合呈现面：账本中不存在第三条「BROWSER 聚合」记录；返回二元组类型上无
 *    聚合 verdict 位（D22 双通道 ∥ 并存，security-legs-e2e 同款纪律）；
 * ③ 互不牵连矩阵：MCP 未注册（.mcp.json 缺席）→ 交互腿 not_configured 而
 *    playwright 腿照常真跑判卷（缺席不牵连真跑判卷；双通道各自显式状态）；
 * ④ §26.2 维度闸落盘面：缺 console 维度的报告在入账边界仍是 not_run（非默认值）
 *    ——出口判据 2 的 L2 面；
 * ⑤ doctor 探测矩阵扩容：真实 runDoctor 呈现 playwright 探针（与
 *    chrome_devtools_mcp 探针并存——双通道各自显式呈现）。
 *
 * @0.3.0 注记（P0.5-4b · W1-D2 批 2 · PRD §6.7/§14 P0.5-4）：MCP 交互腿增环境身份
 * 前置门——EnvironmentReceipt 缺席或 doctor_verdict 非 READY → blocked（PRD Case H
 * 「Verification BLOCKED」+ §6.7「Verification 不得 PASS」）。本 spec 主矩阵是
 * P26 双腿判卷语义（@0.2.0 时代逐字不变），runLegs 统一供给 READY 环境判卷输入
 * （经 kernel runEnvironmentDoctor 真判卷链，禁手拼回执）；环境门矩阵与 Benchmark E
 * 全链归 packages/gauntlet-lite/test/browser-environment-gate.spec.ts 与
 * tests/integration/browser-legs-environment.spec.ts。
 *
 * 说明（recipe 分母边界）：BROWSER 双腿不经 catalog/gates recipe 派发（catalog
 * recipe 归 P29/CV 领域）；「同一次 check 跑双通道=两条 GRN」由 gauntlet-lite 的
 * runBrowserGateLegs 编排面承载，入账通路与 check --gates 同一 kernel 事务边界。
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CONSOLE_DIMENSION_ATTACHMENT,
  NETWORK_DIMENSION_ATTACHMENT,
  runBrowserGateLegs,
  playwrightReportAbsolutePath,
  type BrowserEnvironmentInput,
  type DetectorFacts,
  type GateResultRecord,
} from "@pomaster/gauntlet-lite";
import type { Actor, EnvironmentExpectation, Store } from "@pomaster/kernel";
import {
  applyTransaction,
  createStore,
  gateResultToSnake,
  normalizeGateResult,
} from "@pomaster/kernel";
import { runDoctor, runInit } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(pathJoin(tmpdir(), "pvnext-browser-legs-"));
});

// ============================================================
// afterEach 清理的有界确定性重试（P26 红队 MINOR · EBUSY flake；P25 同款形态）：
// Windows 并发全量下（SQLite/文件句柄释放晚于断言）rmSync 偶发 EBUSY/EPERM/EACCES。
// 20/50/100/200/400ms 五次退避（kernel IO_RETRY_DELAYS_MS / withBoundedRetry 惯例——
// 局部 helper，不动共享面）；重试耗尽仍失败照常上抛原始错误（禁静默吞错）。
// （2026-09-01 windows CI 实证注记：有界重试只能吸收「句柄迟释」类瞬态——
// 本文件曾因 MCP 腿误走真实 npx smoke（见 runLegs 注），被杀 smoke 的孤儿
// node 进程持续占住 fixture cwd，重试窗口再长也救不了；根因在源头封死，
// 重试保留给真正的瞬态形态。）
// ============================================================
const RM_RETRY_DELAYS_MS = [20, 50, 100, 200, 400] as const;

function rmTempRootWithBoundedRetry(target: string): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      rmSync(target, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      const transient = code === "EBUSY" || code === "EPERM" || code === "EACCES";
      if (attempt >= RM_RETRY_DELAYS_MS.length || !transient) {
        throw error;
      }
      // 确定性同步等待（Atomics.wait；kernel sleepSync 同款，不经未导出面）。
      const waitMs = RM_RETRY_DELAYS_MS[attempt] as number;
      const buffer = new Int32Array(new SharedArrayBuffer(4));
      try {
        Atomics.wait(buffer, 0, 0, waitMs);
      } catch {
        const end = performance.now() + waitMs;
        while (performance.now() < end) {
          /* spin：确定性时长兜底 */
        }
      }
    }
  }
}

afterEach(() => {
  rmTempRootWithBoundedRetry(root);
});

// ============================================================
// DetectorFacts 构造（fake PATH 承担工具在位性；.mcp.json 按 opts 装配——
// 配置面与报告回读走真实 fs 双通道，security-legs-e2e 先例）
// ============================================================

const FAKE_TOOLS = "C:/fake-browser-tools";

interface LegPresence {
  readonly mcpRegistered?: boolean;
}

function browserFacts(presence: LegPresence = {}): DetectorFacts {
  const suffixes =
    process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  const files: Record<string, string | null> = {
    [pathJoin(root, "browser-gate.json")]: JSON.stringify({
      playwright: { command: "corepack pnpm exec playwright test --reporter=json" },
    }),
    [pathJoin(root, "package.json")]: JSON.stringify({
      devDependencies: { "@playwright/test": "^1.49.0" },
    }),
  };
  if (presence.mcpRegistered !== false) {
    files[pathJoin(root, ".mcp.json")] = JSON.stringify({
      mcpServers: {
        "chrome-devtools": { command: "npx", args: ["chrome-devtools-mcp@latest"] },
      },
    });
  }
  return {
    projectRoot: root,
    pathEnv: FAKE_TOOLS,
    pathSeparator: process.platform === "win32" ? ";" : ":",
    executableSuffixes: suffixes,
    joinPath: (base, rel) => pathJoin(base, rel),
    fileExists: (absolutePath) => absolutePath in files,
    readTextFile: (absolutePath) => files[absolutePath] ?? null,
  };
}

// ============================================================
// 官方 JSONReport 夹具 + fake spawn（版本探测分派 + 真执行真实写盘）
// ============================================================

function dimension(name: string, entries: readonly unknown[]): Record<string, unknown> {
  return {
    name,
    contentType: "application/json",
    body: Buffer.from(JSON.stringify(entries), "utf8").toString("base64"),
  };
}

function reportJson(consoleEntries: readonly unknown[]): string {
  return JSON.stringify({
    suites: [
      {
        title: "tests/traversal/pages.spec.ts",
        file: "tests/traversal/pages.spec.ts",
        specs: [
          {
            title: "页面加载 /",
            file: "tests/traversal/pages.spec.ts",
            line: 3,
            tests: [
              {
                status: "expected",
                results: [
                  {
                    status: "passed",
                    attachments: [
                      dimension(CONSOLE_DIMENSION_ATTACHMENT, consoleEntries),
                      dimension(NETWORK_DIMENSION_ATTACHMENT, []),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    errors: [],
  });
}

const CLEAN_REPORT = reportJson([]);
const CONSOLE_DIRTY_REPORT = reportJson([
  { text: "Uncaught TypeError: x is not a function", url: "https://app.local/main.js" },
]);
/** 缺 console 维度的报告（B3-1 维度闸的入账边界面：仅 network 附件，console 缺席）。 */
const MISSING_DIM_REPORT = JSON.stringify({
  suites: [
    {
      title: "tests/traversal/pages.spec.ts",
      file: "tests/traversal/pages.spec.ts",
      specs: [
        {
          title: "页面加载 /",
          file: "tests/traversal/pages.spec.ts",
          line: 3,
          tests: [
            {
              status: "expected",
              results: [
                {
                  status: "passed",
                  attachments: [dimension(NETWORK_DIMENSION_ATTACHMENT, [])],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  errors: [],
});

function legsSpawn(
  reportText: string | null,
): (command: string, options: { readonly cwd: string; readonly timeoutMs: number }) => {
  status: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
  externalMs: number;
} {
  return (command) => {
    if (command.includes("version")) {
      return { status: 0, stdout: "Version 1.49.0\n", stderr: "", error: null, externalMs: 5 };
    }
    if (reportText !== null) {
      const abs = playwrightReportAbsolutePath(root, "reports/browser/playwright.json");
      mkdirSync(pathJoin(abs, ".."), { recursive: true });
      writeFileSync(abs, reportText, "utf8");
    }
    return { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 };
  };
}

/** MCP 证据三件套（2026-08-31 宿主 chrome-devtools MCP 实测词形构造）。 */
const MCP_FULL_EVIDENCE: readonly unknown[] = [
  {
    tool: "take_snapshot",
    content: [
      {
        type: "text",
        text: '## Latest page snapshot\nuid=1_0 RootWebArea "app"\n  uid=1_2 button "ok"',
      },
    ],
  },
  {
    tool: "take_screenshot",
    content: [{ type: "image", data: "iVBORw0KGgoAAAANSUhEUg==", mimeType: "image/png" }],
  },
  {
    tool: "performance_stop_trace",
    content: [
      { type: "text", text: "## Summary of Performance trace findings:\nCLS: 0.00" },
    ],
  },
];

const LEG_IDENTITIES = [
  { grn: "GRN-0001", ranAtSeq: 10 },
  { grn: "GRN-0002", ranAtSeq: 11 },
] as const;

/**
 * §6.7 READY 环境判卷输入（P0.5-4b · @0.3.0 前置门）：期望面五项身份核全申报 +
 * 实测面全等（判卷经 kernel runEnvironmentDoctor 真链——本 spec 不手拼回执）。
 * 本 spec 主矩阵钉的是 @0.2.0 时代双腿判卷语义（READY 回执下逐字不变）；环境门
 * 矩阵归 browser-environment-gate.spec / browser-legs-environment.spec。
 */
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

const READY_ENVIRONMENT: BrowserEnvironmentInput = {
  expected: READY_EXPECTATION,
  observed: { ...READY_EXPECTATION },
  executionId: "AGX-2026-00001",
};

function runLegs(
  reportText: string | null,
  presence: LegPresence = {},
  evidence: readonly unknown[] = MCP_FULL_EVIDENCE,
): readonly [GateResultRecord, GateResultRecord] {
  return runBrowserGateLegs(
    { projectRoot: root, subjectId: null, denominatorRefs: [] },
    LEG_IDENTITIES,
    {
      facts: browserFacts(presence),
      spawnFn: legsSpawn(reportText),
      executableProbe: (name) =>
        name === "corepack" || name === "node" ? pathJoin(FAKE_TOOLS, name) : null,
      expectedToolVersions: { playwright: "1.49.0" },
      // 编排方证据注入面：MCP 工具结果按真实词形交给交互腿归一化面。
      mcpEvidenceProvider: () => evidence,
      // smoke 注入面（连接前置证据，非判卷锚——判卷锚=证据三件套）：本 spec 头注
      // 声明的「fake spawn × 真实 adapter 归一，零网络零下载」要求 MCP 交互腿同样
      // 不 spawn。此前未注入 = 误走真实 `npx -y chrome-devtools-mcp@latest` 握手
      // （windows CI 2026-09-01 实证链：冷 npx 缓存下载 > 15s smoke 超时 →
      // connected=false → 交互腿误红 failed（用例时长 15503ms ≈ 15s 超时字面）；
      // 且被超时击杀的 smoke 留下孤儿 node 进程持 fixture cwd → afterEach rmdir
      // EBUSY 有界重试耗尽）。真实连通性的 e2e 归
      // gauntlet-lite/test/browser-adapter.spec.ts（宿主未装诚实 skip——缺席链面）。
      smokeFn: () => ({ connected: true, pageTitle: null, failureReason: null }),
      // @0.3.0 环境身份前置门（W1-D2）：READY 判卷输入——缺省会 fail-closed 成
      // blocked（PRD §6.7 验收句），本 spec 钉的 @0.2.0 判卷语义须 READY 供给。
      environment: READY_ENVIRONMENT,
    },
  );
}

/** check --gates 同款入账边界：normalizeGateResult 判卷复算 → 单事务两 op 入账。 */
async function ledgerIngest(records: readonly GateResultRecord[]): Promise<number> {
  const store: Store = await createStore(root);
  const trigger = "on_demand" as const;
  const judged = records.map((record) =>
    normalizeGateResult(
      {
        value: gateResultToSnake(record),
        claimedBy: {
          actorType: "tool",
          actor: record.tool,
          selfAttested: true,
        } satisfies Actor,
      },
      {
        ranAtSeq: record.ranAtSeq,
        trigger,
        tool: record.tool,
        toolVersion: record.toolVersion,
        metricDialect: record.metricDialect,
      },
    ),
  );
  const applied = await applyTransaction(store, {
    ops: judged.map((record) => ({
      op: "record_gate_run" as const,
      run: { grn: record.grn, trigger, result: record },
    })),
  });
  return applied.appliedSeq;
}

function runsDir(): string {
  return pathJoin(root, ".pomaster", "evidence", "runs");
}

function readRunInline(fileName: string): Record<string, unknown> {
  const record = JSON.parse(
    readFileSync(pathJoin(runsDir(), fileName), "utf8"),
  ) as Record<string, unknown>;
  expect(record["record_type"]).toBe("run");
  return ((record["gate_result"] as Record<string, unknown>)["result"] ??
    {}) as Record<string, unknown>;
}

// ============================================================
// ① 双通道两条 GRN 独立入账（出口判据 1 场景）
// ============================================================

describe("① BROWSER 双通道两条 GRN 独立入账（playwright 红 + MCP 绿）", () => {
  it("双腿真判卷 → P12c 复算 → 单事务两 GRN 落盘，tool/metric_dialect/verdict 随腿互异", async () => {
    await runInit(root);
    const records = runLegs(CONSOLE_DIRTY_REPORT);
    const appliedSeq = await ledgerIngest(records);
    expect(appliedSeq).toBeGreaterThan(0);

    const files = readdirSync(runsDir()).filter((name) => name !== "README.md").sort();
    expect(files).toEqual(["GRN-0001.json", "GRN-0002.json"]);

    const inlines = files.map(readRunInline);
    expect(inlines.map((inline) => inline["verdict"])).toEqual(["failed", "passed"]);
    expect(inlines.map((inline) => inline["tool"])).toEqual([
      "gauntlet:playwright",
      "gauntlet:browser",
    ]);
    expect(inlines.map((inline) => inline["metric_dialect"])).toEqual([
      "browser:playwright_traversal",
      "browser:mcp_interactive_evidence",
    ]);
    // 红腿 violations 从报告重算（console 违规在 items 不丢失——§26.2 Console Error 承载）。
    const playwright = inlines[0] as Record<string, unknown>;
    expect((playwright["counts"] as Record<string, unknown>)["violations"]).toBe(1);
    const items = playwright["items"] as readonly Record<string, unknown>[];
    expect(items[0]?.["rule"]).toBe("browser_console_error");
    // 绿腿（MCP 交互腿）scope.note 载三件套清单（证据字节不入记录）。
    const browser = inlines[1] as Record<string, unknown>;
    const scope = browser["scope"] as Record<string, unknown> | undefined;
    expect(String(scope?.["note"])).toContain("a11y_snapshot");
    expect(String(scope?.["note"])).toContain("screenshot");
    expect(String(scope?.["note"])).toContain("performance_trace");
  });

  it("② 无聚合呈现面：账本零「BROWSER 聚合」第三条记录；二元组类型上无聚合 verdict 位", async () => {
    await runInit(root);
    const records = runLegs(CLEAN_REPORT);
    expect(records).toHaveLength(2);
    for (const record of records) {
      // 返回二元组元素是逐腿记录，不存在任何聚合 ok/verdict 键（结构性断言）。
      expect(record).not.toHaveProperty("ok");
      expect(["gauntlet:playwright", "gauntlet:browser"]).toContain(record.tool);
    }
    await ledgerIngest(records);
    expect(readdirSync(runsDir()).filter((name) => name !== "README.md").sort()).toEqual(["GRN-0001.json", "GRN-0002.json"]);
  });
});

// ============================================================
// ③ 互不牵连矩阵（MCP 缺席 → not_configured 不牵连 playwright 真跑判卷）
// ============================================================

describe("③ 互不牵连：MCP 交互腿缺席，playwright 腿照常真跑判卷", () => {
  it("MCP 未注册 → 交互腿 not_configured + 安装路标；playwright 腿独立判卷（干净 → passed）", async () => {
    await runInit(root);
    const [playwright, browser] = runLegs(CLEAN_REPORT, { mcpRegistered: false });
    expect(playwright.verdict).toBe("passed");
    expect(playwright.tool).toBe("gauntlet:playwright");
    expect(browser.verdict).toBe("not_configured");
    expect(browser.scopeNote).toContain("安装 chrome-devtools MCP");
    expect(new Set([playwright.grn, browser.grn]).size).toBe(2);
    await ledgerIngest([playwright, browser]);
    const verdicts = readdirSync(runsDir()).filter((name) => name !== "README.md")
      .sort()
      .map((f) => readRunInline(f)["verdict"]);
    expect(verdicts).toEqual(["passed", "not_configured"]);
  });

  it("反向：MCP 交互腿绿（三件套齐备）不洗白 playwright 腿的红（console 违规）", () => {
    const [playwright, browser] = runLegs(CONSOLE_DIRTY_REPORT);
    expect(playwright.verdict).toBe("failed");
    expect(playwright.counts.violations).toBe(1);
    expect(browser.verdict).toBe("passed");
  });
});

// ============================================================
// ④ §26.2 维度闸落盘面（出口判据 2 的 L2 面：缺维 → not_run 入账）
// ============================================================

describe("④ 缺 console 维度的报告 → not_run（非默认值）入账边界", () => {
  it("维度不完整报告在 kernel 复算后仍 not_run（诚实缺席，非绿非红）", async () => {
    await runInit(root);
    const records = runLegs(MISSING_DIM_REPORT);
    expect(records[0].verdict).toBe("not_run");
    expect(records[0].scopeNote).toContain(CONSOLE_DIMENSION_ATTACHMENT);
    // 同批交互腿三件套齐备照常 passed（维度闸只落本腿）。
    expect(records[1].verdict).toBe("passed");
    await ledgerIngest(records);
    const verdicts = readdirSync(runsDir()).filter((name) => name !== "README.md")
      .sort()
      .map((f) => readRunInline(f)["verdict"]);
    expect(verdicts).toEqual(["not_run", "passed"]);
  });

  it("完全干净报告（双维度空数组齐备）→ passed 入账（空数组=干净是合法维度）", async () => {
    await runInit(root);
    const records = runLegs(CLEAN_REPORT);
    expect(records[0].verdict).toBe("passed");
    await ledgerIngest(records);
    const verdicts = readdirSync(runsDir()).filter((name) => name !== "README.md")
      .sort()
      .map((f) => readRunInline(f)["verdict"]);
    expect(verdicts).toEqual(["passed", "passed"]);
  });
});

// ============================================================
// ⑤ doctor 探测矩阵扩容（playwright 探针与 chrome_devtools_mcp 并存）
// ============================================================

describe("⑤ doctor 探测矩阵扩容：playwright 探针呈现（双通道并存的探测面）", () => {
  it("真实 runDoctor 呈现 playwright 探针（缺席 NOT_INSTALLED 非静默 + 安装路标；真装容忍 READY）", async () => {
    await runInit(root);
    const outcome = await runDoctor(root);
    const probe = outcome.result.probes.find((p) => p.probe === "playwright");
    expect(probe).toBeDefined();
    expect(probe?.status === "NOT_INSTALLED" || probe?.status === "READY").toBe(true);
    if (probe?.status === "NOT_INSTALLED") {
      expect(probe.hint ?? "").toMatch(/playwright/);
    }
    // 双通道并存：chrome_devtools_mcp 探针照常呈现（D22 探测面不被 P26 扩容挤掉）。
    const mcpProbe = outcome.result.probes.find((p) => p.probe === "chrome_devtools_mcp");
    expect(mcpProbe).toBeDefined();
  });
});
