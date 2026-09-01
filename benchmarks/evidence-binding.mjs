#!/usr/bin/env node
/**
 * evidence-binding.mjs —— Self-hosting Benchmark B「Evidence Binding Tamper」（PRD §15）
 * + §16 Case E 同场景落档（裁决8③④，2026-09-01；D8=A 独立基准文件，不入 run-all 三档）。
 *
 * 场景（全程零网络零下载：fake smoke × fake spawn × 实测词形 MCP 三件套证据）：
 *   Round 1（control）：双腿 → persist screenshot（Infrastructure-issued Receipt）→
 *     GRN 携 artifact_refs 入账 → verified bytes == persisted artifact == Gate Result
 *     referenced artifact（PRD §7.4 Acceptance；binding=bound，PASS 成立）；
 *   Round 2（tamper = Case E「验证 A 存 B」）：入账后替换持久化 blob 字节 →
 *     verifyEvidenceBinding → EVIDENCE_BINDING_INCOMPLETE / FAIL——呈现面绝不出现 PASS；
 *   Round 3（file-missing）：删除绑定 blob → FAIL（artifact_file_missing）同断言。
 *
 * 判卷锚：kernel verifyEvidenceBinding（read-side 篡改审计）+ gauntlet-lite
 * adjudicateEvidenceBindingClause（POLICY.GATE.BROWSER@0.2.0 绑定条款判卷本体——
 * 绑定 FAIL 时账面 passed 不得呈现，映射 failed + items rule=EVIDENCE_BINDING_INCOMPLETE）。
 *
 * 结果落盘 benchmarks/evidence-binding-last-results.json（seq 自增 + run_id eb-NNNN；
 * timestamp 禁入身份字段——运行序以 seq 整数标识，durationMs 允许）。
 *
 * 退出码：0 = 全部断言通过；1 = 存在断言失败（治理缺陷，正确动作是修实现后重跑，
 * 禁改判卷）；2 = 基准装置错误（dist 缺席/崩溃——前置：packages/{schemas,kernel,
 * gauntlet-lite} 的 dist 在座且与 src 同步）。
 * 运行：node benchmarks/evidence-binding.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const startedAt = performance.now();
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

// ============================================================
// 装置自检（dist 在座性；缺席 = 装置错误 exit 2，禁伪造测量）
// ============================================================

const KERNEL_DIST = join(repoRoot, "packages", "kernel", "dist", "index.js");
const GAUNTLET_DIST = join(repoRoot, "packages", "gauntlet-lite", "dist", "index.js");

if (!existsSync(KERNEL_DIST) || !existsSync(GAUNTLET_DIST)) {
  console.error(
    "[evidence-binding] 基准装置错误：packages/{kernel,gauntlet-lite} dist 缺席。\n" +
      "  前置（定向编译，不经 build-all）：tsc -p packages/schemas → cp assets → " +
      "tsc -p packages/kernel → tsc -p packages/gauntlet-lite（见 docs 或 build-all.mjs 拓扑）",
  );
  process.exit(2);
}

const kernel = await import(pathToFileURL(KERNEL_DIST).href);
const gauntlet = await import(pathToFileURL(GAUNTLET_DIST).href);

const RESULTS_SCHEMA = "pomaster.vnext.evidence-binding-benchmark/1";
const resultsPath = join(here, "evidence-binding-last-results.json");

function readPrevSeq() {
  try {
    const prev = JSON.parse(readFileSync(resultsPath, "utf8"));
    return Number.isInteger(prev?.seq) ? prev.seq : 0;
  } catch {
    return 0;
  }
}

// ============================================================
// fixture（tests/integration/evidence-binding-e2e 同款：fake PATH × fake spawn ×
// fake smoke × 2026-08-31 宿主 chrome-devtools MCP 实测词形三件套——零网络零下载）
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

const SCREENSHOT_B64 = "iVBORw0KGgoAAAANSUhEUg==";
const MCP_FULL_EVIDENCE = [
  {
    tool: "take_snapshot",
    content: [
      { type: "text", text: '## Latest page snapshot\nuid=1_0 RootWebArea "app"\n  uid=1_2 button "ok"' },
    ],
  },
  { tool: "take_screenshot", content: [{ type: "image", data: SCREENSHOT_B64, mimeType: "image/png" }] },
  {
    tool: "performance_stop_trace",
    content: [{ type: "text", text: "## Summary of Performance trace findings:\nCLS: 0.00" }],
  },
];

const LEG_IDENTITIES = [
  { grn: "GRN-0001", ranAtSeq: 10 },
  { grn: "GRN-0002", ranAtSeq: 11 },
];

function browserFacts(root) {
  const files = {
    [join(root, "browser-gate.json")]: JSON.stringify({
      playwright: { command: "corepack pnpm exec playwright test --reporter=json" },
    }),
    [join(root, "package.json")]: JSON.stringify({
      devDependencies: { "@playwright/test": "^1.49.0" },
    }),
    [join(root, ".mcp.json")]: JSON.stringify({
      mcpServers: { "chrome-devtools": { command: "npx", args: ["chrome-devtools-mcp@latest"] } },
    }),
  };
  return {
    projectRoot: root,
    pathEnv: FAKE_TOOLS,
    pathSeparator: process.platform === "win32" ? ";" : ":",
    executableSuffixes: process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""],
    joinPath: (base, rel) => join(base, rel),
    fileExists: (p) => p in files,
    readTextFile: (p) => files[p] ?? null,
  };
}

function legsSpawn(root) {
  return (command) => {
    if (command.includes("version")) {
      return { status: 0, stdout: "Version 1.49.0\n", stderr: "", error: null, externalMs: 5 };
    }
    const abs = join(root, "reports", "browser", "playwright.json");
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, CLEAN_REPORT, "utf8");
    return { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 };
  };
}

/** 一轮完整装置：临时 store + 双腿 + persist + 入账（零网络）。 */
async function runRound() {
  const root = mkdtempSync(join(tmpdir(), "pvnext-w1-evb-bench-"));
  const store = await kernel.createStore(root);
  const outcome = await gauntlet.runBrowserGateLegsWithScreenshotBinding({
    scope: { projectRoot: root, subjectId: null, denominatorRefs: [] },
    identities: LEG_IDENTITIES,
    deps: {
      facts: browserFacts(root),
      spawnFn: legsSpawn(root),
      executableProbe: (name) => (name === "corepack" || name === "node" ? join(FAKE_TOOLS, name) : null),
      expectedToolVersions: { playwright: "1.49.0" },
      mcpEvidenceProvider: () => MCP_FULL_EVIDENCE,
      smokeFn: () => ({ connected: true, pageTitle: null, failureReason: null }),
    },
    store,
  });
  const evidenceDir = kernel.pathsOf(store).evidenceDir;
  const runsDir = join(root, ".pomaster", "evidence", "runs");
  return { root, store, outcome, evidenceDir, runsDir };
}

function teardown(round) {
  try {
    rmSync(round.root, { recursive: true, force: true });
  } catch {
    /* 临时目录清理尽力而为（Windows 句柄迟释由 OS 回收；不作为判卷对象） */
  }
}

/** 呈现词形（Benchmark 输出面）：绑定 FAIL 时必含 FAIL 且不含 PASS（「绝不维持 PASS」）。 */
function presentBinding(binding) {
  if (binding === null || binding === undefined) return "NOT_APPLICABLE";
  if (binding.bound === true) return "PASS";
  return `FAIL ${binding.code} (${binding.reason})`;
}

function blobPathOf(round) {
  return join(round.evidenceDir, round.outcome.screenshotBlobRef.storagePath);
}

// ============================================================
// 断言装置
// ============================================================

const assertions = [];
function record(id, ok, detail) {
  assertions.push({ id, ok, detail });
  return ok;
}
function assertEq(id, actual, expected) {
  const ok = actual === expected;
  return record(id, ok, `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}
function assertDeep(id, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  return record(id, ok, `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

const rounds = {};

// ============================================================
// Round 1（control）：四环节全链路 + §7.4 三方同一性
// ============================================================

const r1 = await runRound();
try {
  rounds.control = {
    playwright_verdict: r1.outcome.legs[0].verdict,
    browser_verdict: r1.outcome.legs[1].verdict,
    binding: presentBinding(r1.outcome.binding),
    blob_storage_path: r1.outcome.screenshotBlobRef?.storagePath ?? null,
  };
  assertEq("r1.1 playwright 腿独立判卷 passed", r1.outcome.legs[0].verdict, "passed");
  assertEq("r1.2 browser 腿 passed（三件套判卷不受绑定层污染）", r1.outcome.legs[1].verdict, "passed");
  assertEq("r1.3 Receipt 在座（blob 落盘）", Boolean(r1.outcome.screenshotBlobRef), true);
  assertDeep("r1.4 binding=bound", r1.outcome.binding, { bound: true, artifactCount: 1 });

  // §7.4 三方同一性：verified bytes == persisted artifact == GRN referenced artifact。
  const blobBytes = readFileSync(blobPathOf(r1));
  assertEq(
    "r1.5 persisted artifact sha == 引用身份",
    kernel.sha256OfBytes(new Uint8Array(blobBytes)),
    r1.outcome.screenshotBlobRef.sha256,
  );
  assertEq(
    "r1.6 verified bytes（判卷选中件解码）== persisted bytes",
    Buffer.from(SCREENSHOT_B64, "base64").equals(blobBytes),
    true,
  );

  const grn2 = JSON.parse(readFileSync(join(r1.runsDir, "GRN-0002.json"), "utf8"));
  const refs = grn2.artifact_refs ?? [];
  assertEq("r1.7 GRN 携 artifact_refs（blob 分支）", refs.length, 1);
  assertEq("r1.8 GRN 引用身份 == persisted 身份", refs[0]?.blob?.sha256, r1.outcome.screenshotBlobRef.sha256);
  assertEq("r1.9 GRN 引用路径 == persisted 路径", refs[0]?.blob?.storage_path, r1.outcome.screenshotBlobRef.storagePath);

  const grn1 = readFileSync(join(r1.runsDir, "GRN-0001.json"), "utf8");
  assertEq("r1.10 无主张腿（playwright）零 artifact_refs 键", grn1.includes("artifact_refs"), false);
  assertEq(
    "r1.11 证据字节不入记录（base64 原文零泄漏）",
    readFileSync(join(r1.runsDir, "GRN-0002.json"), "utf8").includes(SCREENSHOT_B64),
    false,
  );
  assertEq(
    "r1.12 入账分母恰好两 GRN",
    readdirSync(r1.runsDir).sort().join(","),
    "GRN-0001.json,GRN-0002.json",
  );
} finally {
  teardown(r1);
}

// ============================================================
// Round 2（Case E tamper）：入账后替换持久化字节 → FAIL 绝不维持 PASS
// ============================================================

const r2 = await runRound();
try {
  const before = kernel.verifyEvidenceBinding({
    runRecordPath: join(r2.runsDir, "GRN-0002.json"),
    evidenceDir: r2.evidenceDir,
  });
  assertDeep("r2.1 篡改前 control=bound", before, { bound: true, artifactCount: 1 });

  // 「Adapter 验证 Screenshot A、Evidence Pack 存 Screenshot B」——入账后替换字节。
  writeFileSync(blobPathOf(r2), Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00]));
  const tampered = kernel.verifyEvidenceBinding({
    runRecordPath: join(r2.runsDir, "GRN-0002.json"),
    evidenceDir: r2.evidenceDir,
  });
  assertEq("r2.2 篡改检出 bound=false", tampered.bound, false);
  assertEq("r2.3 稳定码 EVIDENCE_BINDING_INCOMPLETE", tampered.code, kernel.EVIDENCE_BINDING_INCOMPLETE);
  assertEq("r2.4 reason=artifact_bytes_tampered", tampered.reason, "artifact_bytes_tampered");

  // 0.2.0 条款判卷映射：账面 passed 在绑定 FAIL 时必须呈现为红。
  const presented = gauntlet.adjudicateEvidenceBindingClause(r2.outcome.legs[1], tampered);
  assertEq("r2.5 绑定 FAIL → 判卷红 failed（绝不维持 PASS）", presented.record.verdict, "failed");
  assertEq(
    "r2.6 items rule=EVIDENCE_BINDING_INCOMPLETE（门内 rule + 稳定码并用，D5）",
    presented.record.items?.some((item) => item.rule === "EVIDENCE_BINDING_INCOMPLETE") === true,
    true,
  );
  const presentation = presentBinding(tampered);
  rounds.tamper = { binding: presentation, mapped_verdict: presented.record.verdict };
  assertEq("r2.7 呈现面含 FAIL", presentation.includes("FAIL"), true);
  assertEq("r2.8 呈现面无 PASS", presentation.includes("PASS"), false);
} finally {
  teardown(r2);
}

// ============================================================
// Round 3（file-missing）：删除绑定 blob → FAIL
// ============================================================

const r3 = await runRound();
try {
  rmSync(blobPathOf(r3));
  const missing = kernel.verifyEvidenceBinding({
    runRecordPath: join(r3.runsDir, "GRN-0002.json"),
    evidenceDir: r3.evidenceDir,
  });
  assertEq("r3.1 缺失检出 bound=false", missing.bound, false);
  assertEq("r3.2 reason=artifact_file_missing", missing.reason, "artifact_file_missing");
  const presentation = presentBinding(missing);
  rounds.file_missing = { binding: presentation };
  assertEq("r3.3 呈现面含 FAIL", presentation.includes("FAIL"), true);
  assertEq("r3.4 呈现面无 PASS", presentation.includes("PASS"), false);
} finally {
  teardown(r3);
}

// ============================================================
// 落盘 + 退出码
// ============================================================

const seq = readPrevSeq() + 1;
const ok = assertions.every((entry) => entry.ok === true);
const report = {
  schema: RESULTS_SCHEMA,
  run_id: `eb-${String(seq).padStart(4, "0")}`,
  seq,
  ok,
  benchmark: "evidence-binding-tamper",
  prd_anchors: ["§7 Evidence Artifact Binding", "§14 P0.5-2", "§15 Benchmark B", "§16 Case E"],
  rounds,
  assertions,
  assertions_total: assertions.length,
  assertions_failed: assertions.filter((entry) => !entry.ok).length,
  durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
};

writeFileSync(resultsPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

for (const entry of assertions.filter((item) => !item.ok)) {
  console.error(`[evidence-binding] FAIL ${entry.id} — ${entry.detail}`);
}
console.log(
  `[evidence-binding] ${report.run_id} ok=${String(ok)} assertions=${report.assertions_total}/` +
    `${report.assertions_failed} failed; rounds: control=${rounds.control?.binding} ` +
    `tamper=${rounds.tamper?.binding} file_missing=${rounds.file_missing?.binding}`,
);
process.exit(ok ? 0 : 1);
