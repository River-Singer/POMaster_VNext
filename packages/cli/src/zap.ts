/**
 * zap.ts —— ZAP 动态扫描腿（TS-3；code-spec zap-dynamic.md）。
 *
 * Owner 裁定（2026-11-19）：`pomaster sit zap baseline|api` 挂 SIT 组（主动扫描只对
 * 一次性环境跑的纪律逐字对应——调研 §5.2）；消费 TS-1 的 env.json + sit build.json 产物
 * 指纹 + api/openapi/<surface>.openapi.json；ZAP-#### 轮落 .pomaster/sit/ 台账族；
 * security-zap.json 规则映射（IGNORE/WARN/FAIL）判卷，gate SECURITY。
 *
 * 职责边界（显式）：
 * - 扫描容器 ghcr.io/zaproxy/zaproxy:stable，--add-host host.docker.internal:host-gateway
 *   统一宿主寻址（Linux/Windows Desktop 双态同词形）；报告挂载 rootDir 内（真实 fs）。
 * - 判卷单一锚在 pomaster：JSON 报告 alerts 风险级 × 规则映射 → FAIL/WARN/IGNORE；
 *   规则映射缺席时默认口径 riskcode>=3(HIGH) → FAIL。zap 脚本退出码非判卷锚
 *   （0/1/2/3 语义随默认策略漂移——报告重算同律）。
 * - baseline = 被动扫（快，两基址）；api = OpenAPI 导入主动扫（逐面，会改数据——
 *   只对一次性环境，证据面如实标注 scan_kind）。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { failOutcome, okOutcome, type CliError, type CommandOutcome } from "./envelope.js";
import { loadSitManifest, makeSitIo, startBackendApps, waitAppHealthy, type SitEnvPointer, type SitIo } from "./sit.js";

// ============================================================
// 锚定词形
// ============================================================

export const ZAP_IMAGE = "ghcr.io/zaproxy/zaproxy:stable";
export const ZAP_REPORT_DIR = "reports/zap";
export const ZAP_RULES_CONFIG_FILE = "security-zap.json";
export const ZAP_LEDGER = ".pomaster/sit/zap-runs.jsonl";
export const ZAP_RUNS_DIR = ".pomaster/sit/runs";
export const ZAP_GATE = "SECURITY";
export const ZAP_RUN_SCHEMA = "pomaster.zap-run/v1";
export type ZapMode = "baseline" | "api";
export const ZAP_MODES: readonly ZapMode[] = ["baseline", "api"];
/** 默认判卷口径：riskcode>=3（HIGH）→ FAIL（规则映射可覆盖）。 */
export const ZAP_DEFAULT_FAIL_RISKCODE = 3;

// ============================================================
// 规则映射（security-zap.json → zap rules conf + 判卷）
// ============================================================

export type ZapRuleAction = "IGNORE" | "WARN" | "FAIL";

export interface ZapRules {
  /** pluginId → 动作（未列出的插件按默认口径 riskcode>=ZAP_DEFAULT_FAIL_RISKCODE → FAIL）。 */
  readonly rules: Readonly<Record<string, ZapRuleAction>>;
}

export function readZapRules(rootDir: string, readText: (path: string) => string | null): ZapRules {
  const raw = readText(join(rootDir, ZAP_RULES_CONFIG_FILE));
  if (raw === null) return { rules: {} };
  try {
    const parsed = JSON.parse(raw) as { rules?: unknown };
    if (typeof parsed !== "object" || parsed === null || typeof parsed.rules !== "object" || parsed.rules === null) {
      return { rules: {} };
    }
    const rules: Record<string, ZapRuleAction> = {};
    for (const [pluginId, action] of Object.entries(parsed.rules as Record<string, unknown>)) {
      if (action === "IGNORE" || action === "WARN" || action === "FAIL") rules[pluginId] = action;
    }
    return { rules };
  } catch {
    return { rules: {} };
  }
}

/** zap 脚本 -c 规则文件行（pluginId\tACTION\t由 security-zap.json 生成）。 */
export function zapRulesConfLines(rules: ZapRules): readonly string[] {
  return Object.entries(rules.rules).map(([pluginId, action]) => `${pluginId}\t${action}\tsecurity-zap.json`);
}

export function judgeAlert(
  pluginId: string,
  riskcode: number,
  rules: ZapRules,
): "IGNORE" | "WARN" | "FAIL" {
  const mapped = rules.rules[pluginId];
  if (mapped !== undefined) return mapped;
  return riskcode >= ZAP_DEFAULT_FAIL_RISKCODE ? "FAIL" : "WARN";
}

// ============================================================
// 报告词形（zap JSON：{"site":[{"alerts":[{pluginid,riskcode,name,count,…}]}]}）
// ============================================================

export interface ZapAlert {
  readonly pluginId: string;
  readonly riskcode: number;
  readonly name: string;
  readonly count: number;
}

export function parseZapReport(raw: string): readonly ZapAlert[] | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null) return null;
  const sites = (json as Record<string, unknown>)["site"];
  if (!Array.isArray(sites)) return null;
  const alerts: ZapAlert[] = [];
  for (const site of sites) {
    if (typeof site !== "object" || site === null) return null;
    const rawAlerts = (site as Record<string, unknown>)["alerts"];
    if (rawAlerts === undefined || rawAlerts === null) continue;
    if (!Array.isArray(rawAlerts)) return null;
    for (const alert of rawAlerts) {
      if (typeof alert !== "object" || alert === null) return null;
      const record = alert as Record<string, unknown>;
      const pluginId = typeof record["pluginid"] === "string" ? record["pluginid"] : null;
      const riskcodeRaw = typeof record["riskcode"] === "string" ? Number(record["riskcode"]) : typeof record["riskcode"] === "number" ? record["riskcode"] : null;
      const name = typeof record["name"] === "string" ? record["name"] : null;
      const countRaw = typeof record["count"] === "string" ? Number(record["count"]) : typeof record["count"] === "number" ? record["count"] : 1;
      if (pluginId === null || riskcodeRaw === null || !Number.isFinite(riskcodeRaw) || name === null) return null;
      alerts.push({ pluginId, riskcode: riskcodeRaw, name, count: Number.isFinite(countRaw) ? countRaw : 1 });
    }
  }
  return alerts;
}

// ============================================================
// 注入（同 sit 全套缝；spawn fake 写报告落盘）
// ============================================================

export interface ZapRunResult {
  readonly run_id: string;
  readonly mode: ZapMode;
  readonly verdict: "passed" | "warning" | "failed";
  readonly gate: typeof ZAP_GATE;
  readonly scan_targets: readonly string[];
  findings: {
    readonly pluginId: string;
    readonly riskcode: number;
    readonly name: string;
    readonly count: number;
    readonly action: "IGNORE" | "WARN" | "FAIL";
  }[];
  readonly rules_conf: readonly string[];
  readonly detail_path: string;
}

const emptyZapRun = (): ZapRunResult => ({ run_id: "", mode: "baseline", verdict: "failed", gate: ZAP_GATE, scan_targets: [], findings: [], rules_conf: [], detail_path: "" });

function latestReport(rootDir: string, prefix: string): string | null {
  const reportDir = join(rootDir, ...ZAP_REPORT_DIR.split("/"));
  if (!existsSync(reportDir)) return null;
  const candidates = readdirSync(reportDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".json"))
    .map((entry) => join(reportDir, entry.name))
    .sort((a, b) => statMtime(b) - statMtime(a));
  return candidates[0] ?? null;
}

function statMtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

export async function runSitZap(
  rootDir: string,
  input: { readonly mode: ZapMode; readonly healthIntervalMs?: number; readonly durationMinutes?: number },
  inject?: Partial<SitIo>,
): Promise<CommandOutcome<ZapRunResult>> {
  const command = `sit zap ${input.mode}`;
  const envPointer = readJsonSafe(rootDir, ".pomaster/sit/env.json") as SitEnvPointer | null;
  if (envPointer === null) {
    return failOutcome(command, emptyZapRun(), [{ code: "ZAP_ENV_NOT_UP", message: "没有在座 SIT 环境指针——先 pomaster sit up", hint: "主动扫描只对一次性环境跑（调研 §5.2 纪律）；环境未起时拒绝" }], ["环境未起"]);
  }
  const sitBuild = readJsonSafe(rootDir, ".pomaster/sit/build.json") as { jars: readonly { path: string; sha256: string }[] } | null;
  if (sitBuild === null) {
    return failOutcome(command, emptyZapRun(), [{ code: "ZAP_STALE_BUILD", message: "后端构建清单缺席——先 pomaster sit build", hint: "ZAP 扫的是合并构建产物" }], ["后端未构建"]);
  }
  for (const jar of sitBuild.jars) {
    const abs = join(rootDir, ...jar.path.split("/"));
    if (!existsSync(abs) || createHash("sha256").update(readFileSync(abs)).digest("hex") !== jar.sha256) {
      return failOutcome(command, emptyZapRun(), [{ code: "ZAP_STALE_BUILD", message: `后端产物指纹对不上：${jar.path}`, hint: "重新 sit build（迟到拒收同律）" }], ["后端产物陈旧"]);
    }
  }
  const io = makeSitIo(envPointer.container, envPointer.schema_name, envPointer.port, inject);

  const dockerProbe = io.spawn("docker", ["--version"], { timeoutMs: 30_000 });
  if (dockerProbe.error !== null || dockerProbe.status !== 0) {
    return failOutcome(command, emptyZapRun(), [{ code: "ZAP_DOCKER_UNAVAILABLE", message: "docker 不可用——ZAP 官方镜像扫描需要 Docker", hint: "安装并启动 Docker Desktop" }], ["docker 缺席"]);
  }

  const manifest = await loadSitManifest(rootDir);
  if (isCliErrorValue(manifest)) {
    return failOutcome(command, emptyZapRun(), [{ ...manifest, code: "ZAP_MANIFEST_ABSENT" }], [manifest.message]);
  }
  const spec = manifest.spec;

  const surfaces = (["admin", "public"] as const).filter((surface) => spec.surfaces[surface] !== undefined);
  const targets: { readonly surface: string; readonly openapi: string | null; readonly baseUrl: string }[] = surfaces.map((surface) => ({
    surface,
    openapi: input.mode === "api" ? join("api", "openapi", `${surface}.openapi.json`) : null,
    baseUrl: `http://host.docker.internal:${String(surface === "admin" ? 18080 : 18090)}${trimBase(spec.surfaces[surface]?.base_path)}`,
  }));
  if (input.mode === "api") {
    const missing = targets.filter((target) => !existsSync(join(rootDir, ...target.openapi!.split("/"))));
    if (missing.length > 0) {
      return failOutcome(command, emptyZapRun(), [{ code: "ZAP_OPENAPI_ABSENT", message: `OpenAPI 定义缺席：${missing.map((target) => target.openapi).join("、")}——先 scaffold generate`, hint: "api 扫描逐面导入 OpenAPI 3.1（脚手架生成物）" }], ["OpenAPI 缺席"]);
    }
  }

  const rules = readZapRules(rootDir, (path) => (existsSync(path) ? readFileSync(path, "utf8") : null));
  const rulesLines = zapRulesConfLines(rules);

  const apps = startBackendApps(rootDir, io, spec, manifest.appKey, envPointer);
  const human: string[] = [];
  if (apps.error !== null) return failOutcome(command, emptyZapRun(), [apps.error], ["应用启动失败"]);
  for (const process of apps.processes) {
    const ready = await waitAppHealthy(io, process.surface, input.healthIntervalMs ?? 1000);
    if (!ready) {
      for (const pending of apps.processes) pending.kill();
      return failOutcome(command, emptyZapRun(), [{ code: "ZAP_APP_NOT_READY", message: `${process.surface} 面未就绪——扫不动的服务不产生证据`, hint: "看 backend target/sit-run.log" }], ["应用未就绪"]);
    }
  }

  const ledgerCount = existsSync(join(rootDir, ...ZAP_LEDGER.split("/"))) ? readFileSync(join(rootDir, ...ZAP_LEDGER.split("/")), "utf8").split("\n").filter((line) => line.trim() !== "").length : 0;
  const runId = `ZAP-${String(ledgerCount + 1).padStart(4, "0")}`;
  const findings: ZapRunResult["findings"] = [];
  const scanTargets: string[] = [];
  try {
    mkdirSync(join(rootDir, ...ZAP_REPORT_DIR.split("/")), { recursive: true });
    if (rulesLines.length > 0) writeFileSync(join(rootDir, ...ZAP_REPORT_DIR.split("/"), "rules.conf"), rulesLines.join("\n") + "\n", "utf8");
    const rulesFlag = rulesLines.length > 0 ? ["-c", "/zap/wrk/reports/zap/rules.conf"] : [];
    const durationFlag = input.durationMinutes !== undefined ? ["-z", `scan.maxDuration=${String(input.durationMinutes)}`] : [];

    const scans = input.mode === "baseline"
      ? targets.map((target) => ({ label: `baseline:${target.surface}`, script: "zap-baseline.py", reportName: `baseline-${target.surface}.json`, args: ["-t", `${target.baseUrl}/`] }))
      : targets.map((target) => ({ label: `api:${target.surface}`, script: "zap-api-scan.py", reportName: `api-${target.surface}.json`, args: ["-O", `/zap/wrk/${target.openapi}`, "-t", `${target.baseUrl}/`] }));

    for (const scan of scans) {
      scanTargets.push(scan.label);
      const run = io.spawn(
        "docker",
        [
          "run", "--rm", "--add-host", "host.docker.internal:host-gateway",
          "-v", `${rootDir}:/zap/wrk:rw`,
          ZAP_IMAGE,
          scan.script,
          ...rulesFlag,
          ...durationFlag,
          ...scan.args,
          "-J", `/zap/wrk/${ZAP_REPORT_DIR}/${scan.reportName}`,
        ],
        { timeoutMs: 1_800_000 },
      );
      if (run.error !== null || run.status === null) {
        return failOutcome(command, emptyZapRun(), [{ code: "ZAP_SCAN_FAILED", message: `扫描容器执行失败（${scan.label}）：${tailStr(run.stderr, 400)}`, hint: "docker pull ghcr.io/zaproxy/zaproxy:stable 后重跑；首次拉镜像较慢" }], human);
      }
      const reportPath = latestReport(rootDir, scan.reportName.replace(".json", ""));
      const rawReport = reportPath === null ? null : readFileSync(reportPath, "utf8");
      const alerts = rawReport === null ? null : parseZapReport(rawReport);
      if (alerts === null) {
        return failOutcome(command, emptyZapRun(), [{ code: "ZAP_REPORT_UNPARSABLE", message: `ZAP 报告缺席或不符合词形（${scan.label}）：${reportPath ?? `${ZAP_REPORT_DIR}/${scan.reportName}`}`, hint: "报告是唯一判卷锚；-J 落点与挂载词形核对后重跑" }], human);
      }
      for (const alert of alerts) {
        findings.push({ pluginId: alert.pluginId, riskcode: alert.riskcode, name: alert.name, count: alert.count, action: judgeAlert(alert.pluginId, alert.riskcode, rules) });
      }
    }
  } finally {
    for (const process of apps.processes) process.kill();
  }

  const verdict: ZapRunResult["verdict"] = findings.some((finding) => finding.action === "FAIL")
    ? "failed"
    : findings.some((finding) => finding.action === "WARN")
      ? "warning"
      : "passed";
  const detailPathRel = `${ZAP_RUNS_DIR}/${runId}.json`;
  mkdirSync(join(rootDir, ...ZAP_RUNS_DIR.split("/")), { recursive: true });
  writeFileSync(join(rootDir, ...detailPathRel.split("/")), `${JSON.stringify({ schema: ZAP_RUN_SCHEMA, run_id: runId, mode: input.mode, verdict, gate: ZAP_GATE, scan_targets: scanTargets, rules, findings }, null, 2)}\n`, "utf8");
  const ledgerLine = { schema: ZAP_RUN_SCHEMA, seq: ledgerCount + 1, id: runId, mode: input.mode, verdict, gate: ZAP_GATE, fail: findings.filter((finding) => finding.action === "FAIL").length, warn: findings.filter((finding) => finding.action === "WARN").length, finished_at: new Date().toISOString() };
  mkdirSync(join(rootDir, ...".pomaster/sit".split("/")), { recursive: true });
  appendFileSync(join(rootDir, ...ZAP_LEDGER.split("/")), `${JSON.stringify(ledgerLine)}\n`, "utf8");

  for (const finding of findings) {
    human.push(`${finding.action} ${finding.name}（plugin ${finding.pluginId}，risk ${String(finding.riskcode)}，×${String(finding.count)}）`);
  }
  if (findings.length === 0) human.push("零发现（报告在座且无 alerts）");
  human.push(`明细 ${detailPathRel}；台账 ${ZAP_LEDGER}`);

  const result: ZapRunResult = { run_id: runId, mode: input.mode, verdict, gate: ZAP_GATE, scan_targets: scanTargets, findings, rules_conf: zapRulesConfLines(rules), detail_path: detailPathRel };
  if (verdict === "failed") {
    return failOutcome(command, result, [{ code: "ZAP_FINDINGS_FAILED", message: `${String(findings.filter((finding) => finding.action === "FAIL").length)} 项 FAIL 级发现——证据如实，不粉饰`, hint: `看 ${detailPathRel}；规则口径调 security-zap.json（IGNORE/WARN/FAIL 逐插件映射）` }], human);
  }
  return okOutcome(command, result, human);
}

// ============================================================
// 小工具
// ============================================================

function readJsonSafe(rootDir: string, relative: string): unknown | null {
  try {
    return JSON.parse(readFileSync(join(rootDir, ...relative.split("/")), "utf8"));
  } catch {
    return null;
  }
}

const tailStr = (text: string, cap: number): string => (text.length <= cap ? text : `…${text.slice(-cap)}`);

const trimBase = (base: string | undefined): string => {
  const trimmed = (base ?? "").replace(/\/$/, "");
  return trimmed === "" ? "" : trimmed;
};

const isCliErrorValue = (value: unknown): value is CliError => typeof value === "object" && value !== null && typeof (value as CliError).code === "string";

