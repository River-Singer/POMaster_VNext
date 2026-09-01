/**
 * evidence-binding-e2e.spec.ts —— P0.5-2 Screenshot Evidence Binding 全链路 E2E
 * （PRD §7/§14 + §16 Case E 对抗 + §15 Benchmark B 同场景；裁决8③④，tests/integration L2 账）：
 *
 * ① 全链路：双腿（fake spawn × fake smoke × 真实 adapter 归一，零网络零下载）→
 *    kernel persistEvidenceArtifact 内容寻址落盘 → GRN 携 artifact_refs 入账 →
 *    blob 文件字节 sha256 == GRN 引用身份（verified bytes == persisted artifact ==
 *    Gate Result referenced artifact，§7.4）；playwright 腿无 artifact_refs（无主张无绑定）；
 * ② Case E 对抗：入账后替换持久化 blob 字节（验证 A 存 B）→ verifyEvidenceBinding
 *    FAIL（EVIDENCE_BINDING_INCOMPLETE / artifact_bytes_tampered）且 PASS 不呈现
 *    （0.2.0 条款判卷映射 → failed）；
 * ③ 文件缺失对抗 → artifact_file_missing；
 * ④ 字节兼容：无 artifact_refs 的 GRN canonical 重放字节不变（存量 already_canonical
 *    不破）；带 artifact_refs 的 GRN canonical 重放字节不变（重入账不剥绑定字段；
 *    record 通路 SKIPPED_CANONICAL 零写入）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  adjudicateEvidenceBindingClause,
  runBrowserGateLegsWithScreenshotBinding,
  type DetectorFacts,
  type GateResultRecord,
} from "@pomaster/gauntlet-lite";
import {
  createStore,
  normalizeGateResult,
  pathsOf,
  sha256OfBytes,
  verifyEvidenceBinding,
  EVIDENCE_BINDING_INCOMPLETE,
  type Store,
} from "@pomaster/kernel";
// 直连模块（不经 @pomaster/cli barrel）：batch-1 文件面互斥期 cli/index.ts 归 W1-A1 线，
// 且并行批次的 context.ts 可能处于中间态——本 spec 只依赖 init/record/evidence 三模块。
import { runInit } from "../../packages/cli/src/init.js";
import { runRecordGateRun } from "../../packages/cli/src/record.js";
import {
  canonicalRunBytes,
  parseRunFile,
  resolveArtifactRefs,
  resolveAssertedClaimedBy,
  resolveExecutionId,
  resolveRunContext,
} from "../../packages/cli/src/evidence.js";

let root: string;
let store: Store;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pvnext-w1-evb-e2e-"));
  await runInit(root);
  store = await createStore(root);
});

// Windows rm 瞬态句柄迟释的有界重试（browser-legs-e2e 同款形态；Atomics.wait 确定性等待）。
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
// fixture（browser-legs-e2e 同款：fake PATH × fake spawn × fake smoke × 实测词形证据）
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

/** MCP 证据三件套（2026-08-31 宿主 chrome-devtools MCP 实测词形；PNG 签名头锚）。 */
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

function runBindingFlow(input: { readonly browserVersion?: string } = {}): ReturnType<typeof runBrowserGateLegsWithScreenshotBinding> {
  return runBrowserGateLegsWithScreenshotBinding({
    scope: { projectRoot: root, subjectId: null, denominatorRefs: [] },
    identities: LEG_IDENTITIES,
    deps: {
      facts: browserFacts(),
      spawnFn: legsSpawn(),
      executableProbe: (name) =>
        name === "corepack" || name === "node" ? join(FAKE_TOOLS, name) : null,
      expectedToolVersions: {
        playwright: "1.49.0",
        ...(input.browserVersion !== undefined ? { browser: input.browserVersion } : {}),
      },
      mcpEvidenceProvider: () => MCP_FULL_EVIDENCE,
      smokeFn: () => ({ connected: true, pageTitle: null, failureReason: null }),
    },
    store,
  });
}

function evidenceDir(): string {
  return pathsOf(store).evidenceDir;
}

function runsDir(): string {
  return join(root, ".pomaster", "evidence", "runs");
}

function readEnvelope(grn: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(runsDir(), `${grn}.json`), "utf8")) as Record<string, unknown>;
}

/** canonical GRN 文件的字节级重放（planRunFile 同一判据；返回重放字节）。 */
function replayCanonicalBytes(grn: string, bytes: string): string {
  const parsed = parseRunFile(bytes);
  if ("error" in parsed) throw new Error(parsed.error);
  const claimedBy = resolveAssertedClaimedBy(parsed);
  if ("detail" in claimedBy) throw new Error(claimedBy.detail);
  const resolved = resolveRunContext(parsed, { sampledRanAtSeq: 0 });
  if ("failCode" in resolved) throw new Error(`${resolved.failCode}: ${resolved.detail}`);
  const result = normalizeGateResult(
    { value: { ...parsed.rawValue, grn }, claimedBy: claimedBy.claimedBy ?? { actorType: "tool", actor: "(unattributed)", selfAttested: true } },
    resolved.context,
  );
  const executionId = resolveExecutionId(undefined, parsed.executionIdRaw);
  if ("fail" in executionId) throw new Error(executionId.fail);
  const refs = resolveArtifactRefs(parsed.artifactRefsRaw);
  if ("fail" in refs) throw new Error(refs.fail);
  return canonicalRunBytes(grn, resolved.context.trigger, result, executionId.executionId, refs.refs);
}

// ============================================================
// ① 全链路：MCP Result → Receipt（blob）→ Gate Result Ref → Verify same identity
// ============================================================

describe("① 全链路（PRD §7.2 四环节）", () => {
  it("双腿 → persist screenshot → GRN 携 artifact_refs 入账 → 同一性三方一致（§7.4）", async () => {
    const outcome = await runBindingFlow();

    // 双腿判定：playwright 干净 → passed；browser 三件套齐备 → passed（0.2.0 判卷不受污染）。
    expect(outcome.legs[0]?.verdict).toBe("passed");
    expect(outcome.legs[1]?.verdict).toBe("passed");
    expect(outcome.adjudicated).toBe(false);
    expect(outcome.appliedSeq).toBeGreaterThan(0);

    // Receipt：blob 内容寻址落盘 + read-side binding bound。
    const blobRef = outcome.screenshotBlobRef;
    expect(blobRef).not.toBeNull();
    const blobAbsolute = join(evidenceDir(), blobRef?.storagePath ?? "");
    expect(existsSync(blobAbsolute)).toBe(true);
    expect(outcome.binding).toEqual({ bound: true, artifactCount: 1 });

    // 同一性：verified bytes（判卷选中件）== persisted artifact（blob 文件）==
    // Gate Result referenced artifact（GRN artifact_refs 身份）。
    expect(sha256OfBytes(new Uint8Array(readFileSync(blobAbsolute)))).toBe(blobRef?.sha256);
    expect(Buffer.from(SCREENSHOT_B64, "base64").equals(readFileSync(blobAbsolute))).toBe(true);

    // GRN 信封：browser 腿带 artifact_refs（blob 分支）；playwright 腿零 artifact_refs 键。
    const browserEnvelope = readEnvelope("GRN-0002");
    const refs = browserEnvelope["artifact_refs"] as readonly Record<string, unknown>[];
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      ref_type: "blob",
      blob: {
        sha256: blobRef?.sha256,
        media: "screenshot",
        byte_size: blobRef?.byteSize,
        storage_path: blobRef?.storagePath,
      },
    });
    const playwrightEnvelope = readEnvelope("GRN-0001");
    expect(playwrightEnvelope).not.toHaveProperty("artifact_refs");

    // 证据字节不入记录：base64 原文绝不进任何落盘 GRN。
    const ledgerText = readFileSync(join(runsDir(), "GRN-0002.json"), "utf8");
    expect(ledgerText).not.toContain(SCREENSHOT_B64);

    // 入账文件全分母：恰好两 GRN。
    expect(readdirSync(runsDir()).sort()).toEqual(["GRN-0001.json", "GRN-0002.json"]);
  });
});

// ============================================================
// ② Case E 对抗：Adapter 验证 Screenshot A，Evidence Pack 存 Screenshot B
// ============================================================

describe("② Case E：入账后替换持久化 blob → binding FAIL 绝不维持 PASS", () => {
  it("篡改 blob 字节 → verifyEvidenceBinding FAIL（artifact_bytes_tampered）+ 0.2.0 判卷映射红", async () => {
    const outcome = await runBindingFlow();
    const blobRef = outcome.screenshotBlobRef;
    expect(blobRef).not.toBeNull();

    // 入账后替换持久化字节（Screenshot A → Screenshot B）。
    const blobAbsolute = join(evidenceDir(), blobRef?.storagePath ?? "");
    writeFileSync(blobAbsolute, Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00]));

    const tampered = verifyEvidenceBinding({
      runRecordPath: join(runsDir(), "GRN-0002.json"),
      evidenceDir: evidenceDir(),
    });
    expect(tampered).toMatchObject({
      bound: false,
      code: EVIDENCE_BINDING_INCOMPLETE,
      reason: "artifact_bytes_tampered",
    });

    // 无 PASS 呈现：被篡改 run 的 verdict 经 0.2.0 条款判卷映射必为红（failed +
    // items rule=EVIDENCE_BINDING_INCOMPLETE）——账面 passed 不得在绑定 FAIL 时呈现。
    const browserLeg = outcome.legs[1] as GateResultRecord;
    expect(browserLeg.verdict).toBe("passed");
    const presented = adjudicateEvidenceBindingClause(browserLeg, tampered);
    expect(presented.adjudicated).toBe(true);
    expect(presented.record.verdict).toBe("failed");
    expect(presented.record.items?.some((item) => item.rule === EVIDENCE_BINDING_INCOMPLETE)).toBe(true);
  });

  it("warning（capped passed：tool_version 漂移）腿同样附挂 refs——篡改审计链不断", async () => {
    const outcome = await runBindingFlow({ browserVersion: "9.9.9" });
    expect(outcome.legs[1]?.verdict).toBe("warning");
    expect(outcome.legs[1]?.verdictCapReason).toBe("tool_version_drifted");
    expect(outcome.screenshotBlobRef).not.toBeNull();
    expect(outcome.binding).toEqual({ bound: true, artifactCount: 1 });
    const envelope = readEnvelope("GRN-0002");
    expect(envelope["artifact_refs"]).toHaveLength(1);
  });
});

// ============================================================
// ③ 文件缺失对抗
// ============================================================

describe("③ 绑定 blob 文件缺失 → FAIL（artifact_file_missing）", () => {
  it("删除 blob 后 verify FAIL（存在性主张悬空被检出）", async () => {
    const outcome = await runBindingFlow();
    const blobRef = outcome.screenshotBlobRef;
    const blobAbsolute = join(evidenceDir(), blobRef?.storagePath ?? "");
    rmSync(blobAbsolute);
    const missing = verifyEvidenceBinding({
      runRecordPath: join(runsDir(), "GRN-0002.json"),
      evidenceDir: evidenceDir(),
    });
    expect(missing).toMatchObject({
      bound: false,
      code: EVIDENCE_BINDING_INCOMPLETE,
      reason: "artifact_file_missing",
    });
  });
});

// ============================================================
// ④ 字节兼容（R1 双写点：存量 GRN 重放字节不变；带 refs 重放不剥绑定字段）
// ============================================================

describe("④ 字节兼容：canonical 重放", () => {
  it("无 artifact_refs 的存量 GRN：重放字节不变（already_canonical 快路径不破）", async () => {
    await runBindingFlow();
    const grn = "GRN-0001";
    const bytes = readFileSync(join(runsDir(), `${grn}.json`), "utf8");
    expect(bytes).not.toContain("artifact_refs");
    expect(replayCanonicalBytes(grn, bytes)).toBe(bytes);
  });

  it("带 artifact_refs 的 GRN：重放字节不变（重入账不静默剥绑定字段）", async () => {
    await runBindingFlow();
    const grn = "GRN-0002";
    const bytes = readFileSync(join(runsDir(), `${grn}.json`), "utf8");
    expect(bytes).toContain("artifact_refs");
    expect(replayCanonicalBytes(grn, bytes)).toBe(bytes);
  });

  it("record 通路对带 refs 的 canonical 文件 → SKIPPED_CANONICAL 零写入（refs 不丢）", async () => {
    await runBindingFlow();
    const before = readFileSync(join(runsDir(), "GRN-0002.json"), "utf8");
    const recorded = await runRecordGateRun(root, { from: join(runsDir(), "GRN-0002.json") });
    expect(recorded.result.change).toBe("SKIPPED_CANONICAL");
    expect(recorded.result.grn).toBe("GRN-0002");
    expect(readFileSync(join(runsDir(), "GRN-0002.json"), "utf8")).toBe(before);
  });
});
