/**
 * doctor.ts —— doctor 必检最小集四检（D7 Portability；fail-closed，只读不修）
 * + 工具环境探针（CLI `pomaster doctor` 消费的超集，kernel 契约之外）。
 *
 * 四探针（x-vocab-source: 06 x-pomaster-doctor-coupling / thread-A §7）：
 * 1) vocab_lock_consistency —— 三指纹对账（枚举多头拷贝免疫）；
 * 2) dead_producers_empty —— liveness 经 heartbeat 侧车重算（永不采信自报值，C5），
 *    dead 非空即 DEFECT（fail-closed）；
 * 3) alias_conflicts_empty —— 三重查重（canonical/normalized_key/aliases）冲突非空即 DEFECT；
 * 4) local_binding_probe_replayable —— LOCAL 探针可重放性：runtime 心跳侧车可读且
 *    逐行可解析（重算 liveness 的本地通道），文件缺失=本地盘假设破裂 → environment_error。
 *
 * 探针三态 pass/defect/environment_error——环境异常禁静默（D 线风险备忘）。
 * ok = 全部 probe=pass；任一 defect/environment_error → false（fail-closed）。
 */
import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import type { DoctorReport, Store } from "./index.js";
import { vocabFingerprints } from "./digest.js";
import { readText } from "./io.js";
import { pathsOf, readRawIndex, type StorePaths } from "./paths.js";
import { normalizedKey } from "./id.js";

type UnknownRecord = Record<string, unknown>;

// ============================================================
// 契约：doctorProbes（四检）
// ============================================================

/** 心跳行（runtime/producers/heartbeat.jsonl）：(seq, producer_id, wrote_object_ids[])。 */
interface HeartbeatLine {
  readonly seq: number;
  readonly producerId: string;
}

/** 解析心跳行；结构非法行抛错（调用方决定 defect/environment_error 归属）。 */
function parseHeartbeatLines(text: string): number {
  let count = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const parsed = JSON.parse(trimmed) as UnknownRecord;
    if (typeof parsed.producer_id !== "string" || typeof parsed.seq !== "number") {
      throw new Error(trimmed.slice(0, 60));
    }
    count += 1;
  }
  return count;
}

/**
 * 从心跳重算 liveness（C5：重算获胜，自报值只作对账输入）。
 * - 有心跳：active（last_output_seq 取最大 seq）；
 * - 无心跳且自报 last_output_seq>0 或 runs_since_last_output>0：
 *   自报与侧车矛盾 / 连续 K 轮无产出 → dead（重算获胜）；
 * - 无心跳且 runs=0：刚注册的合法初始态（不判死，06 liveness 注记）。
 */
function recomputeLiveness(
  producerId: string,
  stored: { status: string; runsSinceLastOutput: number; lastOutputSeq: number },
  heartbeats: readonly HeartbeatLine[] | null,
): { status: "active" | "stale" | "dead"; lastOutputSeq: number; contradiction: boolean } {
  void stored.status;
  if (heartbeats === null) {
    return { status: "dead", lastOutputSeq: stored.lastOutputSeq, contradiction: false };
  }
  const seqs = heartbeats
    .filter((line) => line.producerId === producerId)
    .map((line) => line.seq);
  if (seqs.length > 0) {
    return { status: "active", lastOutputSeq: Math.max(...seqs), contradiction: false };
  }
  if (stored.lastOutputSeq > 0 || stored.runsSinceLastOutput > 0) {
    return { status: "dead", lastOutputSeq: stored.lastOutputSeq, contradiction: true };
  }
  return { status: "active", lastOutputSeq: 0, contradiction: false };
}

/** 三重查重（canonical / normalized_key / aliases）冲突输出；非空即 FATAL 级 DEFECT。 */
function computeConflicts(
  paths: StorePaths,
  objects: readonly UnknownRecord[],
): UnknownRecord[] {
  const keys = new Map<string, Set<string>>();
  const register = (key: string, id: string): void => {
    const bucket = keys.get(key) ?? new Set<string>();
    bucket.add(id);
    keys.set(key, bucket);
  };
  for (const row of objects) {
    const id = row.id as string;
    register(normalizedKey(id), id);
    const text = readText(`${paths.pomasterDir}/${String(row.body_ref)}`);
    if (text === null) continue;
    try {
      const body = JSON.parse(text) as UnknownRecord;
      const aliases = body.aliases;
      if (Array.isArray(aliases)) {
        for (const alias of aliases) {
          if (typeof alias === "string" && alias.length > 0) {
            register(normalizedKey(alias), id);
          }
        }
      }
    } catch {
      continue;
    }
  }
  const conflicts: UnknownRecord[] = [];
  for (const [key, ids] of [...keys.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (ids.size >= 2) {
      conflicts.push({ normalized_key: key, conflicting_ids: [...ids].sort() });
    }
  }
  return conflicts;
}

/** doctor 必检最小集四检（契约见 docs/kernel-api.md §7）。只读：不修改 store 状态。 */
export async function doctorProbes(store: Store): Promise<DoctorReport> {
  const paths = pathsOf(store);
  const raw = readRawIndex(paths);
  if (raw === null) {
    const detail = "store 未初始化（state/truth-index.json 缺失）";
    const probes: DoctorReport["probes"] = [
      { probe: "vocab_lock_consistency", status: "defect", detail },
      { probe: "dead_producers_empty", status: "defect", detail },
      { probe: "alias_conflicts_empty", status: "defect", detail },
      {
        probe: "local_binding_probe_replayable",
        status: "defect",
        detail: `${detail}；先跑 createStore 初始化骨架`,
      },
    ];
    return { probes, ok: false };
  }

  // —— 1) vocab_lock 一致 ——
  const vocabLock = raw.vocab_lock as UnknownRecord;
  const fingerprints = vocabFingerprints();
  const fingerprintPairs: readonly (readonly [string, string, string])[] = [
    ["state_axes", vocabLock.state_axes as string, fingerprints.stateAxes],
    ["kinds", vocabLock.kinds as string, fingerprints.kinds],
    ["prefixes", vocabLock.prefixes as string, fingerprints.prefixes],
  ];
  const mismatched = fingerprintPairs.filter(([, stored, expected]) => stored !== expected);
  const probeVocab: DoctorReport["probes"][number] = mismatched.length === 0
    ? {
        probe: "vocab_lock_consistency",
        status: "pass",
        detail: "三指纹对账一致（state_axes/kinds/prefixes）",
      }
    : {
        probe: "vocab_lock_consistency",
        status: "defect",
        detail: `指纹失配：${mismatched.map(([key]) => key).join("/")}——索引由旧词表写入或词表镜像已变更；走词汇表 PR（勿手改指纹，D24）`,
      };

  // —— 2) dead_producers_empty（heartbeat 重算，C5） ——
  const producers = raw.producers as readonly UnknownRecord[];
  let heartbeats: readonly HeartbeatLine[] = [];
  try {
    const heartbeatText = readText(paths.heartbeatPath);
    if (heartbeatText !== null) {
      parseHeartbeatLines(heartbeatText); // 结构校验（不合法行 → defect，见探针 4）
      const lines: HeartbeatLine[] = [];
      for (const line of heartbeatText.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        const parsed = JSON.parse(trimmed) as UnknownRecord;
        lines.push({ seq: parsed.seq as number, producerId: parsed.producer_id as string });
      }
      heartbeats = lines;
    }
  } catch {
    heartbeats = [];
  }
  const deadProducers: string[] = [];
  const contradictions: string[] = [];
  for (const producer of producers) {
    const producerId = producer.producer_id as string;
    const liveness = producer.liveness as UnknownRecord;
    const recomputed = recomputeLiveness(
      producerId,
      {
        status: liveness.status as string,
        runsSinceLastOutput: liveness.runs_since_last_output as number,
        lastOutputSeq: liveness.last_output_seq as number,
      },
      heartbeats,
    );
    if (recomputed.contradiction) contradictions.push(producerId);
    if (recomputed.status === "dead") deadProducers.push(producerId);
  }
  const probeDead: DoctorReport["probes"][number] = deadProducers.length === 0
    ? {
        probe: "dead_producers_empty",
        status: "pass",
        detail: `重算 ${producers.length} 个 producer 的活性（heartbeat 对账，C5）：无 dead`,
      }
    : {
        probe: "dead_producers_empty",
        status: "defect",
        detail: `dead producer 非空（fail-closed）：${deadProducers.join(", ")}${contradictions.length > 0 ? `；自报与心跳矛盾（重算获胜，C5）：${contradictions.join(", ")}` : ""}`,
      };

  // —— 3) alias_conflicts_empty ——
  const objects = raw.objects as readonly UnknownRecord[];
  const conflicts = computeConflicts(paths, objects);
  const probeAlias: DoctorReport["probes"][number] = conflicts.length === 0
    ? {
        probe: "alias_conflicts_empty",
        status: "pass",
        detail: `三重查重（canonical/normalized_key/aliases）通过（扫描 ${objects.length} 对象）`,
      }
    : {
        probe: "alias_conflicts_empty",
        status: "defect",
        detail: `别名/规范化冲突非空（FATAL 级 DEFECT）：${JSON.stringify(conflicts)}——防双登记（GOLDEN-L1-DUP-KEY）`,
      };

  // —— 4) LOCAL binding probe 可重放 ——
  let probeReplay: DoctorReport["probes"][number];
  const heartbeatText = readText(paths.heartbeatPath);
  if (heartbeatText === null) {
    probeReplay = {
      probe: "local_binding_probe_replayable",
      status: "environment_error",
      detail: `runtime 侧车缺失：${paths.heartbeatPath} 不可读——单机本地盘假设破裂必须报 environment_error，禁静默`,
    };
  } else {
    try {
      const eventCount = parseHeartbeatLines(heartbeatText);
      probeReplay = {
        probe: "local_binding_probe_replayable",
        status: "pass",
        detail: `LOCAL 探针可重放：心跳侧车可读且 ${eventCount} 条事件全部可解析${eventCount === 0 && objects.length === 0 ? "（v0：键绑定平面未物化，无可重放 LOCAL 绑定探针——显式缺席，非通过判定）" : ""}`,
      };
    } catch (error) {
      probeReplay = {
        probe: "local_binding_probe_replayable",
        status: "defect",
        detail: `心跳侧车存在不可解析事件行：${String(error)}`,
      };
    }
  }

  const probes: DoctorReport["probes"] = [probeVocab, probeDead, probeAlias, probeReplay];
  const ok = probes.every((probe) => probe.status === "pass");
  return { probes, ok };
}

// ============================================================
// 辅助（契约之外）：工具环境探针（CLI `pomaster doctor` 消费；README「缺什么提示装什么」）
// ============================================================

export type EnvironmentToolName = "node" | "pnpm" | "git" | "gitHubCli";

export interface EnvironmentToolCheck {
  readonly name: EnvironmentToolName;
  readonly status: "READY" | "NOT_INSTALLED";
  readonly version: string | null;
}

export interface McpChromeDevtoolsCheck {
  readonly status: "READY" | "MISSING_CONFIGURATION";
  readonly hint: string;
}

export interface TestPrefixLeak {
  readonly file: string;
  readonly line: number;
  readonly excerpt: string;
}

export interface TestPrefixScanCheck {
  readonly status: "pass" | "violation";
  readonly scannedRoot: string;
  readonly note: string;
  readonly violations: readonly TestPrefixLeak[];
}

export interface ToolEnvironmentReport {
  readonly tools: readonly EnvironmentToolCheck[];
  readonly mcpChromeDevtools: McpChromeDevtoolsCheck;
  readonly testPrefixScan: TestPrefixScanCheck;
}

/** 可注入的命令执行器（测试用假 runner；默认 spawn <command> --version）。 */
export type CommandRunner = (
  command: string,
  args: readonly string[],
) => Promise<{ code: number; stdout: string }>;

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".vue", ".json",
]);

function defaultRunner(
  command: string,
  args: readonly string[],
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, [...args], { shell: false, timeout: 10_000 });
      let stdout = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.on("error", () => resolve({ code: -1, stdout: "" }));
      child.on("close", (code) => resolve({ code: code ?? -1, stdout }));
    } catch {
      resolve({ code: -1, stdout: "" });
    }
  });
}

async function checkTool(
  name: EnvironmentToolName,
  command: string,
  runner: CommandRunner,
): Promise<EnvironmentToolCheck> {
  const result = await runner(command, ["--version"]);
  if (result.code !== 0 || result.stdout.trim().length === 0) {
    return { name, status: "NOT_INSTALLED", version: null };
  }
  return { name, status: "READY", version: result.stdout.trim().split("\n")[0] ?? null };
}

const CHROME_DEVTOOLS_INSTALL_HINT =
  "安装提示：在 .mcp.json 的 mcpServers 内登记 chrome-devtools（如 {\"chrome-devtools\": {\"command\": \"npx\", \"args\": [\"chrome-devtools-mcp@latest\"]}}）；VERIFY 拍的浏览器实时对账依赖它（D22 双通道）";

/**
 * 工具环境探针（kernel 契约 doctorProbes 四检之外的超集，签名未动）：
 * - node/pnpm/git/gitHubCli → READY|NOT_INSTALLED（--version 探测）；
 * - .mcp.json 是否登记 chrome-devtools MCP → 缺失报 MISSING_CONFIGURATION + 安装提示文本
 *   （README：`pomaster doctor` 工具/MCP 配置探测）；
 * - 项目 src 引用 TEST.* 前缀 → 违规探针（ADV-PFX-02：生产代码引用 fixture 域 id）。
 */
export async function probeToolEnvironment(
  projectRoot: string,
  options?: { readonly run?: CommandRunner; readonly srcDir?: string },
): Promise<ToolEnvironmentReport> {
  const runner = options?.run ?? defaultRunner;
  const tools = [
    await checkTool("node", "node", runner),
    await checkTool("pnpm", "pnpm", runner),
    await checkTool("git", "git", runner),
    await checkTool("gitHubCli", "gh", runner),
  ];

  let mcp: McpChromeDevtoolsCheck;
  const mcpPath = `${projectRoot}/.mcp.json`;
  const mcpText = readText(mcpPath);
  if (mcpText === null) {
    mcp = {
      status: "MISSING_CONFIGURATION",
      hint: `${mcpPath} 缺失或无法读取。${CHROME_DEVTOOLS_INSTALL_HINT}`,
    };
  } else {
    try {
      const parsed = JSON.parse(mcpText) as UnknownRecord;
      const servers = parsed.mcpServers;
      const hasChromeDevtools =
        typeof servers === "object" &&
        servers !== null &&
        Object.keys(servers).some((key) => key.includes("chrome-devtools"));
      mcp = hasChromeDevtools
        ? { status: "READY", hint: ".mcp.json 已登记 chrome-devtools MCP" }
        : {
            status: "MISSING_CONFIGURATION",
            hint: `.mcp.json 未登记 chrome-devtools MCP。${CHROME_DEVTOOLS_INSTALL_HINT}`,
          };
    } catch {
      mcp = {
        status: "MISSING_CONFIGURATION",
        hint: `${mcpPath} 无法解析为 JSON。${CHROME_DEVTOOLS_INSTALL_HINT}`,
      };
    }
  }

  const srcDir = options?.srcDir ?? `${projectRoot}/src`;
  const violations: TestPrefixLeak[] = [];
  let note = "";
  try {
    scanTestPrefixLeaks(srcDir, srcDir, violations);
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") {
      note = `扫描根不存在（${srcDir}）：显式缺席，未扫描任何文件`;
    } else {
      throw error;
    }
  }
  return {
    tools,
    mcpChromeDevtools: mcp,
    testPrefixScan: {
      status: violations.length > 0 ? "violation" : "pass",
      scannedRoot: srcDir,
      note,
      violations: violations.slice(0, 100),
    },
  };
}

function scanTestPrefixLeaks(
  root: string,
  dir: string,
  out: TestPrefixLeak[],
): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (out.length >= 100) return;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      scanTestPrefixLeaks(root, full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const dotIndex = entry.name.lastIndexOf(".");
    if (dotIndex === -1 || !TEXT_EXTENSIONS.has(entry.name.slice(dotIndex))) continue;
    const text = readText(full);
    if (text === null) continue;
    const lines = text.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const lineText = lines[index] ?? "";
      const match = /\bTEST\.[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)*/.exec(lineText);
      if (match !== null) {
        out.push({ file: full.slice(root.length + 1), line: index + 1, excerpt: match[0] });
        if (out.length >= 100) return;
      }
    }
  }
}
