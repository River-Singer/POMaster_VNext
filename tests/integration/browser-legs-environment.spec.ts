/**
 * browser-legs-environment.spec.ts —— P0.5-4b §6.7 环境身份前置门全链路 E2E
 * （tests/integration L2 账 · W1-D2 批 2；PRD v0.5.2 §6.7/§6.13 + §14 P0.5-4 验收句
 * + §15 Benchmark E + §16 Case H；Owner 裁决 8 ③④ 2026-09-01；研究笔记
 * perception-doctor-journey.md §5.2 T-B「该 e2e 矩阵即 Benchmark E 的 L2 形态」）。
 *
 * Benchmark E 全句逐段兑现（fake 轨零网络零下载——P36 纪律：fake spawn × fake
 * smoke × fake 证据注入 × 真实 adapter 归一 × 真 kernel persist/入账）：
 *   「wrong instance → Doctor != READY → Verification != PASS → Observation
 *    Receipt 不得冒充有效业务 Evidence」
 *   = Case H（expected revision != runtime revision）→ 交互腿 blocked（七态既有值，
 *     PRD Case H「Verification BLOCKED」逐字）→ 无 blob persist（evidence/blobs 零字节
 *     增量）→ 无 OBS 回执签发（observationReceipt null——环境错的观察根本不产生可
 *     入账的 Evidence）→ blocked GRN 入账不携 artifact_refs。
 *
 * 矩阵：
 * ① Benchmark E 主链（Case H revision mismatch → blocked → 无 persist 无回执）；
 * ② 环境缺省（编排方未供给 = 实例未确认）→ 同 fail-closed（§6.7 验收句字面）；
 * ③ READY 对照链：passed + persist + OBS 回执签发且与 GRN artifact_refs 同一 blob
 *    身份（裁决 8 ③ D1=A：blob sha256 即身份——回执不冒充，它引用的是基础设施签
 *    发的同一身份）；
 * ④ READY + 三件套缺件 → not_run + 无回执（doctor 门不吞证据判卷——门序钉死）；
 * ⑤ blocked GRN 落盘形态：counts 全零 + 无 artifact_refs + scopeNote 载
 *    WRONG_OR_UNVERIFIED_INSTANCE / Verification 不得 PASS 词形（Case H 证据链消费位）；
 * ⑥ 宿主真轨诚实 skip（P36 纪律同款；browser-adapter.spec 先例）：宿主注册
 *    chrome-devtools MCP 时真实通道可达 + 环境错 → blocked（环境门先于连接判卷在
 *    真通道上同样成立）；宿主未注册 → skip + 盲区说明（诚实缺席非通过）。
 *
 * L1 门矩阵（receipt 缺席/非 READY/门序）归
 * packages/gauntlet-lite/test/browser-environment-gate.spec.ts；@0.2.0 绑定条款语义
 * （READY 下逐字不变）归 evidence-binding-e2e.spec.ts。
 */
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runBrowserGateLegsWithScreenshotBinding,
  type BrowserEnvironmentInput,
  type DetectorFacts,
} from "@pomaster/gauntlet-lite";
import {
  createStore,
  pathsOf,
  type EnvironmentExpectation,
  type Store,
} from "@pomaster/kernel";
// 直连模块（不经 @pomaster/cli barrel——evidence-binding-e2e 同款纪律）。
import { runInit } from "../../packages/cli/src/init.js";

let root: string;
let store: Store;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pvnext-w1-env-e2e-"));
  await runInit(root);
  store = await createStore(root);
});

// Windows rm 瞬态句柄迟释的有界重试（evidence-binding-e2e 同款形态）。
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
      const waitMs = RM_RETRY_DELAYS_MS[attempt] as number;
      const buffer = new Int32Array(new SharedArrayBuffer(4));
      try {
        Atomics.wait(buffer, 0, 0, waitMs);
      } catch {
        const end = Date.now() + waitMs;
        while (Date.now() < end) {
          /* spin：确定性时长兜底 */
        }
      }
    }
  }
}

afterEach(() => {
  store = undefined as unknown as Store;
  rmTempRootWithBoundedRetry(root);
});

// ============================================================
// fixture（evidence-binding-e2e 同款：fake PATH × fake spawn × fake smoke × 实测词形证据）
// ============================================================

const FAKE_TOOLS = "C:/fake-browser-tools";
const CLEAN_REPORT = JSON.stringify({
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
                    {
                      name: "console-errors",
                      contentType: "application/json",
                      body: Buffer.from(JSON.stringify([]), "utf8").toString("base64"),
                    },
                    {
                      name: "network-errors",
                      contentType: "application/json",
                      body: Buffer.from(JSON.stringify([]), "utf8").toString("base64"),
                    },
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

/** MCP 证据三件套（宿主实测词形；PNG 签名头锚）。 */
const SCREENSHOT_B64 = "iVBORw0KGgoAAAANSUhEUg==";
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
    content: [{ type: "image", data: SCREENSHOT_B64, mimeType: "image/png" }],
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

function browserFacts(): DetectorFacts {
  const suffixes = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  const files: Record<string, string | null> = {
    [join(root, "browser-gate.json")]: JSON.stringify({
      playwright: { command: "corepack pnpm exec playwright test --reporter=json" },
    }),
    [join(root, "package.json")]: JSON.stringify({
      devDependencies: { "@playwright/test": "^1.49.0" },
    }),
    [join(root, ".mcp.json")]: JSON.stringify({
      mcpServers: {
        "chrome-devtools": { command: "npx", args: ["chrome-devtools-mcp@latest"] },
      },
    }),
  };
  return {
    projectRoot: root,
    pathEnv: FAKE_TOOLS,
    pathSeparator: process.platform === "win32" ? ";" : ":",
    executableSuffixes: suffixes,
    joinPath: (base, rel) => join(base, rel),
    fileExists: (absolutePath) => absolutePath in files,
    readTextFile: (absolutePath) => files[absolutePath] ?? null,
  };
}

function legsSpawn(): (command: string, options: { readonly cwd: string; readonly timeoutMs: number }) => {
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
    const abs = join(root, "reports", "browser", "playwright.json");
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, CLEAN_REPORT, "utf8");
    return { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 };
  };
}

// ============================================================
// §6.7 环境判卷输入夹具（期望面全申报；实测面按场景构造——判卷真链在编排内
// 经 kernel runEnvironmentDoctor 消费，本 spec 不手拼 doctor_verdict）
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

function readyEnvironment(): BrowserEnvironmentInput {
  return {
    expected: READY_EXPECTATION,
    observed: { ...READY_EXPECTATION },
    executionId: "AGX-2026-00001",
  };
}

/** Case H 形态：expected revision != runtime revision（其余八项全等）。 */
function wrongRevisionEnvironment(): BrowserEnvironmentInput {
  return {
    expected: READY_EXPECTATION,
    observed: { ...READY_EXPECTATION, revision_ref: "0000000" },
    executionId: "AGX-2026-00001",
  };
}

function runBindingFlow(input: {
  readonly environment?: BrowserEnvironmentInput | null;
  readonly evidence?: readonly unknown[];
} = {}): ReturnType<typeof runBrowserGateLegsWithScreenshotBinding> {
  return runBrowserGateLegsWithScreenshotBinding({
    scope: { projectRoot: root, subjectId: null, denominatorRefs: [] },
    identities: LEG_IDENTITIES,
    deps: {
      facts: browserFacts(),
      spawnFn: legsSpawn(),
      executableProbe: (name) =>
        name === "corepack" || name === "node" ? join(FAKE_TOOLS, name) : null,
      expectedToolVersions: { playwright: "1.49.0" },
      mcpEvidenceProvider: () => input.evidence ?? MCP_FULL_EVIDENCE,
      smokeFn: () => ({ connected: true, pageTitle: null, failureReason: null }),
    },
    store,
    environment: input.environment,
  });
}

function runsDir(): string {
  return join(root, ".pomaster", "evidence", "runs");
}

function blobsDir(): string {
  return join(pathsOf(store).evidenceDir, "blobs");
}

function readEnvelope(grn: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(runsDir(), `${grn}.json`), "utf8")) as Record<string, unknown>;
}

// ============================================================
// ① Benchmark E 主链（Case H）：wrong instance → Doctor != READY → Verification
//    != PASS → Observation Receipt 不得冒充有效业务 Evidence
// ============================================================

describe("① Benchmark E 主链（Case H revision mismatch）", () => {
  it("doctor 判 WRONG_OR_UNVERIFIED_INSTANCE → 交互腿 blocked → 无 persist 无 OBS 回执 → blocked GRN 零 artifact_refs", async () => {
    const outcome = await runBindingFlow({ environment: wrongRevisionEnvironment() });

    // Verification != PASS（PRD §6.7 逐字 + Case H「Verification BLOCKED」）。
    expect(outcome.legs[1]?.verdict).toBe("blocked");
    expect(outcome.legs[1]?.scopeNote).toContain("WRONG_OR_UNVERIFIED_INSTANCE");
    expect(outcome.legs[1]?.scopeNote).toContain("Verification 不得 PASS");

    // Observation Receipt 不得冒充有效业务 Evidence：无 blob persist（blobs 平面
    // 零落盘）+ 无 OBS 回执签发 + 绑定校验不适用。
    expect(outcome.screenshotBlobRef).toBeNull();
    expect(outcome.observationReceipt).toBeNull();
    expect(outcome.binding).toBeNull();
    expect(existsSync(blobsDir()) && readdirSync(blobsDir()).length > 0).toBe(false);

    // 入账面：blocked GRN 照常入账（诚实缺席呈现）但不携 artifact_refs——环境错的
    // 观察没有任何可引用身份。
    const browserEnvelope = readEnvelope("GRN-0002");
    expect(browserEnvelope).not.toHaveProperty("artifact_refs");
    expect(readdirSync(runsDir()).sort()).toEqual(["GRN-0001.json", "GRN-0002.json"]);

    // 互不牵连：playwright 确定性腿照常真跑判卷（环境门只落 MCP 交互腿——T2 边界）。
    expect(outcome.legs[0]?.verdict).toBe("passed");
  });
});

// ============================================================
// ② 环境缺省 fail-closed（编排方未供给 = 实例未确认）
// ============================================================

describe("② 环境缺省（§6.7 验收句字面 fail-closed）", () => {
  it("environment 未供给 → blocked + 无回执（未确认 base URL / runtime instance 不得判 PASS）", async () => {
    const outcome = await runBindingFlow();
    expect(outcome.legs[1]?.verdict).toBe("blocked");
    expect(outcome.legs[1]?.scopeNote).toContain("环境回执缺席");
    expect(outcome.observationReceipt).toBeNull();
    expect(outcome.screenshotBlobRef).toBeNull();
    expect(readEnvelope("GRN-0002")).not.toHaveProperty("artifact_refs");
  });

  it("environment 显式 null → 同 fail-closed（显式缺席与缺省同语义）", async () => {
    const outcome = await runBindingFlow({ environment: null });
    expect(outcome.legs[1]?.verdict).toBe("blocked");
    expect(outcome.observationReceipt).toBeNull();
  });
});

// ============================================================
// ③ READY 对照链：passed + persist + OBS 回执与 GRN 同一 blob 身份
// ============================================================

describe("③ READY 对照链（回执引用基础设施签发的同一身份，非冒充）", () => {
  it("doctor READY → passed + persist + OBS 回执 artifact_refs == GRN artifact_refs == blob 文件身份", async () => {
    const outcome = await runBindingFlow({ environment: readyEnvironment() });

    expect(outcome.legs[1]?.verdict).toBe("passed");
    const blobRef = outcome.screenshotBlobRef;
    expect(blobRef).not.toBeNull();

    // §6.13 回执签发：OBS-<ranAtSeq> 锚 + OBSERVED + 单一 blob 引用。
    const receipt = outcome.observationReceipt;
    expect(receipt).not.toBeNull();
    expect(receipt?.observation_id).toBe("OBS-11");
    expect(receipt?.execution_id).toBe("AGX-2026-00001");
    expect(receipt?.result).toBe("OBSERVED");
    expect(receipt?.captured_at_seq).toBe(11);
    expect(receipt?.artifact_refs).toHaveLength(1);

    // 同一性三方一致（§7.4 同口径扩展到回执面）：回执引用 == GRN 引用 == 落盘 blob。
    const browserEnvelope = readEnvelope("GRN-0002");
    const grnRefs = browserEnvelope["artifact_refs"] as readonly Record<string, unknown>[];
    expect(grnRefs).toHaveLength(1);
    const grnBlob = (grnRefs[0] as { blob: Record<string, unknown> }).blob;
    expect(receipt?.artifact_refs[0]?.sha256).toBe(blobRef?.sha256);
    expect(grnBlob["sha256"]).toBe(blobRef?.sha256);
    expect(receipt?.artifact_refs[0]?.storagePath).toBe(grnBlob["storage_path"]);
    const blobAbsolute = join(pathsOf(store).evidenceDir, blobRef?.storagePath ?? "");
    expect(existsSync(blobAbsolute)).toBe(true);
  });
});

// ============================================================
// ④ READY + 证据缺件 → not_run（doctor 门不吞证据判卷——门序钉死）+ 无回执
// ============================================================

describe("④ READY + 三件套缺件（门序钉死）", () => {
  it("screenshot 缺 → not_run + 无 persist 无回执（READY 只开环境位，不豁免证据判卷）", async () => {
    const evidence = MCP_FULL_EVIDENCE.filter(
      (entry) => (entry as { tool: string }).tool !== "take_screenshot",
    );
    const outcome = await runBindingFlow({ environment: readyEnvironment(), evidence });
    expect(outcome.legs[1]?.verdict).toBe("not_run");
    expect(outcome.observationReceipt).toBeNull();
    expect(outcome.screenshotBlobRef).toBeNull();
    expect(readEnvelope("GRN-0002")).not.toHaveProperty("artifact_refs");
  });
});

// ============================================================
// ⑤ blocked GRN 落盘形态（Case H 证据链消费位）
// ============================================================

describe("⑤ blocked GRN 落盘形态", () => {
  it("blocked 记录：verdict=blocked + counts 全零 + 无 items + scopeNote 载 doctor 拒证词形", async () => {
    await runBindingFlow({ environment: wrongRevisionEnvironment() });
    const envelope = readEnvelope("GRN-0002");
    const result = (envelope["gate_result"] as Record<string, unknown>)["result"] as Record<string, unknown>;
    expect(result["verdict"]).toBe("blocked");
    expect(result["counts"]).toEqual({
      scanned: 0,
      applicable_scanned: 0,
      violations: 0,
      not_applicable: 0,
    });
    expect(result).not.toHaveProperty("items");
    // scopeNote 落盘词形 = scope.note（gateResultToSnake 归一，gate-result.ts :608）。
    const scopeNote = String(
      (result["scope"] as Record<string, unknown> | undefined)?.["note"] ?? "",
    );
    expect(scopeNote).toContain("WRONG_OR_UNVERIFIED_INSTANCE");
    expect(scopeNote).toContain("BLOCKED");
    // 账本面直证：doctor 拒证判词随 GRN 落盘（Case H 证据链消费位——blocked 的
    // 原因在账本上可读，不是只有内存返回面）。
    const raw = readFileSync(join(runsDir(), "GRN-0002.json"), "utf8");
    expect(raw).toContain("WRONG_OR_UNVERIFIED_INSTANCE");
    expect(raw).toContain("Verification 不得 PASS");
  });
});

// ============================================================
// ⑥ 宿主真轨诚实 skip（P36 纪律；browser-adapter.spec 先例同款）
// ============================================================

describe("宿主真轨（真实 chrome-devtools MCP 通道）", () => {
  it("宿主注册时：真实通道可达 + 环境错 → blocked（环境门先于连接判卷在真通道上同样成立）；宿主未注册 → skip + 盲区说明", { timeout: 60_000 }, async (ctx) => {
    let registered = false;
    try {
      const repoMcp = JSON.parse(
        readFileSync(join(process.cwd(), ".mcp.json"), "utf8"),
      ) as { mcpServers?: Record<string, unknown> };
      registered = Object.keys(repoMcp.mcpServers ?? {}).some((key) =>
        key.includes("chrome-devtools"),
      );
    } catch {
      registered = false;
    }
    if (!registered) {
      // 诚实缺席说明：宿主未注册 chrome-devtools MCP——Benchmark E 宿主真轨跳过；
      // fake 轨（①-⑤）已全覆盖门语义（零网络零下载，CI 确定性）；真通道上的等价
      // 断言（通道可达而环境未确认 → blocked）是显式盲区，不是通过（P36「真网络
      // 依赖封死」纪律：fake 缺省 + real 显式 opt-in）。
      console.warn(
        "[盲区说明] 宿主未注册 chrome-devtools MCP —— Benchmark E 宿主真轨跳过（诚实缺席，非通过）",
      );
      ctx.skip();
    }
    // 真通道（缺省 smokeFn = 真实 npx 握手）+ 环境错 → blocked：环境门先于连接
    // 判卷，真通道可达性救不回未确认实例（Benchmark E 字面在真轨成立）。
    const outcome = await runBrowserGateLegsWithScreenshotBinding({
      scope: { projectRoot: process.cwd(), subjectId: null, denominatorRefs: [] },
      identities: LEG_IDENTITIES,
      deps: {
        mcpEvidenceProvider: () => MCP_FULL_EVIDENCE,
      },
      store,
      environment: wrongRevisionEnvironment(),
    });
    expect(outcome.legs[1]?.verdict).toBe("blocked");
    expect(outcome.legs[1]?.scopeNote).toContain("WRONG_OR_UNVERIFIED_INSTANCE");
    expect(outcome.observationReceipt).toBeNull();
  });
});
