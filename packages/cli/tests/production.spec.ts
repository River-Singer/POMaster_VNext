/**
 * production.spec.ts —— `pomaster production` 命令面测试（P34b · PRD §95 全节 +
 * §30 第四态 + §55.1/§90.4）。
 *
 * 判卷权威在 @pomaster/kernel production.ts（P34a 已全量单测）；本文件钉命令编排
 * 语义：命令词形（band define/list、evaluate、challenge、diagnose、metrics、
 * self-improvement register/list）+ exit code + --json 信封词形 + 错误路径词形族
 * （PRODUCTION_CLI_ERROR_VALUES——schemas vocab.ts P34b 段单一镜像点；
 * absent_in_vocab_lock__pending_vocab_pr + 命令面命名权呈报 Owner）。
 *
 * 命令面三条封条的测试级钉死：
 * - §95.2：evaluate 观测缺席/不可判 = OBSERVATION_NOT_EVALUABLE exit 1 非 fake 绿；
 *   NOT_EVALUABLE 判定显式入账；BREACHED 产 evidence + envelope evidence_ref；
 * - §95.3：challenge 走 applyTransaction（truth index change=CHALLENGED 落库断言）；
 *   无 band/无 evidence/非 CURRENT/对象不符全拒绝；
 * - §90.4：self-improvement register 输出恒带「不得自动应用」注记（人读行 +
 *   result.no_auto_apply + warnings 码位三层）。
 *
 * 测试卫生：fixture 全部 mkdtemp（pomaster-p34-fixture- 前缀）+ afterEach 整树删除；
 * gate 运行台账 fixture 直落临时目录 evidence/runs/；真实 home 绝不触碰。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  createStore,
  loadTruthIndex,
  type Store,
  type Transaction,
} from "@pomaster/kernel";
import { runCli, type CliEnvelope } from "@pomaster/cli";

let dir: string;
const roots: string[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-p34-fixture-cli-"));
  roots.push(dir);
});

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface CapturedIo {
  out: string[];
  err: string[];
}

function capture(): CapturedIo & {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
} {
  const io: CapturedIo = { out: [], err: [] };
  return {
    out: io.out,
    err: io.err,
    stdout: (line) => io.out.push(line),
    stderr: (line) => io.err.push(line),
  };
}

function parseEnvelope(lines: string[]): CliEnvelope<Record<string, unknown>> {
  return JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
}

async function runJson(args: readonly string[]): Promise<{
  code: number;
  env: CliEnvelope<Record<string, unknown>>;
  io: CapturedIo;
}> {
  const io = capture();
  const code = await runCli(["--dir", dir, ...args, "--json"], io);
  return { code, env: parseEnvelope(io.out), io };
}

function errorCodeOf(env: CliEnvelope<Record<string, unknown>>): string {
  const errors = env.errors as { code: string }[] | undefined;
  return errors?.[0]?.code ?? "(no errors)";
}

function warningCodesOf(env: CliEnvelope<Record<string, unknown>>): string[] {
  const warnings = env.warnings as { code: string }[] | undefined;
  return (warnings ?? []).map((w) => w.code);
}

/** band define 快捷调用（缺省合法形态；overrides 覆盖）。 */
async function defineBand(overrides: Record<string, string> = {}): Promise<{
  code: number;
  env: CliEnvelope<Record<string, unknown>>;
}> {
  const args = [
    "production",
    "band",
    "define",
    (overrides["band-id"] as string | undefined) ?? "carline-list-p99-latency",
    "--title",
    overrides["--title"] ?? "车型列表接口 p99 延迟控制带",
    "--capability-ref",
    overrides["--capability-ref"] ?? "PAGE.DASHBOARD",
    "--source",
    overrides["--source"] ?? "metric",
    "--metric-name",
    overrides["--metric-name"] ?? "http.server.requests.p99_ms",
    "--operator",
    overrides["--operator"] ?? "gt",
    "--threshold",
    overrides["--threshold"] ?? "800",
  ];
  for (const extra of ["--threshold-max", "--window"] as const) {
    if (overrides[extra] !== undefined) args.push(extra, overrides[extra] as string);
  }
  const { code, env } = await runJson(args);
  return { code, env };
}

/** store + 对象播种（authority 登记 + upsert；integration makeProject 同款；跨轴断言合规）。 */
async function seedCurrentObject(
  axesOverride: { lifecycle?: string; change?: string; id?: string; evidence?: string } = {},
): Promise<Store> {
  await createStore(dir);
  const authorityPath = join(dir, ".pomaster", "state", "authority.json");
  const authority = JSON.parse(readFileSync(authorityPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  authority.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authorityPath, `${JSON.stringify(authority, null, 2)}\n`);
  const store = await createStore(dir);
  // 跨轴断言（store 既有前置）：PROPOSED ⇒ evidence=PLANNED；缺省 CURRENT+IMPLEMENTED。
  const lifecycle = axesOverride.lifecycle ?? "CURRENT";
  const envelope = {
    id: axesOverride.id ?? "PAGE.DASHBOARD",
    kind: "page_surface",
    axisProfile: "page_default",
    axes: {
      lifecycle,
      confidence: "PROVISIONAL",
      evidence: axesOverride.evidence ?? (lifecycle === "PROPOSED" ? "PLANNED" : "IMPLEMENTED"),
      change: axesOverride.change ?? "STABLE",
    },
    titleZh: "仪表盘",
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: { surface: "V1" },
  };
  const ops: Transaction["ops"] = [{ op: "upsert_object", envelope: envelope as never }];
  await applyTransaction(store, { ops });
  return store;
}

/** band + BREACHED observation 快捷链（返回 breach_ref）。 */
async function seedBreach(options: { capabilityRef?: string } = {}): Promise<string> {
  await defineBand(
    options.capabilityRef !== undefined ? { "--capability-ref": options.capabilityRef } : {},
  );
  const evaluation = await runJson(["production", "evaluate", "carline-list-p99-latency", "--value", "950"]);
  expect(evaluation.code).toBe(0);
  const result = evaluation.env.result as { status: string; evidence_ref: string | null };
  expect(result.status).toBe("BREACHED");
  return result.evidence_ref as string;
}

/** gate 运行台账 fixture（07 run_record inline 形态直落 evidence/runs/）。 */
function seedGateRun(
  grn: string,
  gate: string,
  verdict: string,
  options: { subjectId?: string | null; ranAtSeq?: number } = {},
): void {
  const runsDir = join(dir, ".pomaster", "evidence", "runs");
  mkdirSync(runsDir, { recursive: true });
  const record = {
    record_type: "run",
    grn,
    ran_at_seq: options.ranAtSeq ?? 1,
    trigger: { type: "on_demand" },
    gate_result: {
      mode: "inline",
      result: {
        grn,
        gate,
        gate_def: `POLICY.GATE.${gate}@1.0.0`,
        tool: "spec:production-fixture",
        tool_version: "1.0.0",
        metric_dialect: "fixture:count",
        ran_at_seq: options.ranAtSeq ?? 1,
        verdict,
        subject_id: options.subjectId ?? null,
        is_fixture: false,
        counts: { scanned: 1, applicable_scanned: 1, violations: verdict === "passed" ? 0 : 1, not_applicable: 0 },
        blindspot: { scanned: 1, produced: 1, escape_ratio: 0 },
        trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
        duration_ms: { self: 0, external: 0 },
      },
    },
  };
  writeFileSync(`${runsDir}/${grn}.json`, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  // journal 锚（真实 record_gate_run 经 applyTransaction 落 TX_APPLIED 事件；metrics
  // 可算面按锚收录——注水面封条的合法产物镜像）。
  const journalPath = join(dir, ".pomaster", "state", "journal.jsonl");
  mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
  const seq = options.ranAtSeq ?? 1;
  appendFileSync(
    journalPath,
    `${JSON.stringify({ type: "TX_APPLIED", seq, authority_ref: null, execution_id: null, note: null, ops: ["record_gate_run"], changed_object_ids: [], digest_warnings: 0 })}\n`,
    "utf8",
  );
}

// ============================================================
// production band define
// ============================================================

describe("pomaster production band define（band 定义唯一命令入口）", () => {
  it("happy path → exit 0：phase 恒 IN_PRODUCTION + 谓词字段落盘 + 落点断言", async () => {
    const { code, env } = await defineBand();
    expect(code).toBe(0);
    expect(env.ok).toBe(true);
    const result = env.result as {
      action: string;
      id: string;
      title: string;
      capability_ref: string;
      phase: string;
      source: string;
      metric_name: string;
      predicate: { operator: string; threshold: number };
      window: number | null;
      path: string;
    };
    expect(result.action).toBe("band_define");
    expect(result.id).toBe("carline-list-p99-latency");
    expect(result.phase).toBe("IN_PRODUCTION"); // §30 第四态；构造面无 phase 参数位
    expect(result.source).toBe("metric");
    expect(result.predicate).toEqual({ operator: "gt", threshold: 800 });
    expect(result.window).toBeNull();
    expect(result.path).toBe(".pomaster/production/bands/carline-list-p99-latency.json");
    const onDisk = JSON.parse(
      readFileSync(join(dir, ".pomaster/production/bands/carline-list-p99-latency.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(onDisk.phase).toBe("IN_PRODUCTION");
  });

  it("between 成对 → threshold_max 落盘；between 失对/下界>上界/单阈值算子带 max → BAND_SCHEMA_INVALID", async () => {
    const paired = await defineBand({ "--operator": "between", "--threshold": "10", "--threshold-max": "20" });
    expect(paired.code).toBe(0);
    const result = paired.env.result as { predicate: Record<string, unknown> };
    expect(result.predicate).toEqual({ operator: "between", threshold: 10, threshold_max: 20 });
    const missingMax = await defineBand({ "band-id": "between-missing-max", "--operator": "between", "--threshold": "10" });
    expect(missingMax.code).toBe(1);
    expect(errorCodeOf(missingMax.env)).toBe("BAND_SCHEMA_INVALID");
    const inverted = await defineBand({ "band-id": "between-inverted", "--operator": "between", "--threshold": "30", "--threshold-max": "20" });
    expect(inverted.code).toBe(1);
    expect(errorCodeOf(inverted.env)).toBe("BAND_SCHEMA_INVALID");
    const singleWithMax = await defineBand({ "band-id": "gt-with-max", "--threshold-max": "20" });
    expect(singleWithMax.code).toBe(1);
    expect(errorCodeOf(singleWithMax.env)).toBe("BAND_SCHEMA_INVALID");
  });

  it("id slug 词形 / source / operator 词表外 / 非有限 threshold / --window 0 → BAND_SCHEMA_INVALID", async () => {
    const badId = await defineBand({ "band-id": "Carline-List" });
    expect(badId.code).toBe(1);
    expect(errorCodeOf(badId.env)).toBe("BAND_SCHEMA_INVALID");
    const badSource = await defineBand({ "--source": "dashboard" });
    expect(badSource.code).toBe(1);
    expect(errorCodeOf(badSource.env)).toBe("BAND_SCHEMA_INVALID");
    const badOperator = await defineBand({ "--operator": "approximately" });
    expect(badOperator.code).toBe(1);
    expect(errorCodeOf(badOperator.env)).toBe("BAND_SCHEMA_INVALID");
    const badThreshold = await defineBand({ "--threshold": "abc" });
    expect(badThreshold.code).toBe(1);
    expect(errorCodeOf(badThreshold.env)).toBe("BAND_SCHEMA_INVALID");
    const badWindow = await defineBand({ "--window": "0" });
    expect(badWindow.code).toBe(1);
    expect(errorCodeOf(badWindow.env)).toBe("BAND_SCHEMA_INVALID");
  });

  it("同 id 重复登记 → BAND_SCHEMA_INVALID（band 是可寻址定义，禁静默覆盖）", async () => {
    await defineBand();
    const again = await defineBand();
    expect(again.code).toBe(1);
    expect(errorCodeOf(again.env)).toBe("BAND_SCHEMA_INVALID");
  });
});

// ============================================================
// production band list
// ============================================================

describe("pomaster production band list（清单纯读）", () => {
  it("空 → exit 0 显式空合法态；define 后 → 条目如实呈现", async () => {
    const empty = await runJson(["production", "band", "list"]);
    expect(empty.code).toBe(0);
    const emptyResult = empty.env.result as { action: string; total: number; bands: unknown[] };
    expect(emptyResult.total).toBe(0);
    expect(emptyResult.bands).toEqual([]);
    const human = capture();
    const humanCode = await runCli(["--dir", dir, "production", "band", "list"], human);
    expect(humanCode).toBe(0);
    expect(human.out.join("\n")).toContain("显式空");
    await defineBand();
    const one = await runJson(["production", "band", "list"]);
    expect(one.code).toBe(0);
    const result = one.env.result as {
      total: number;
      bands: { id: string; phase: string; source: string; capability_ref: string }[];
    };
    expect(result.total).toBe(1);
    expect(result.bands[0]?.id).toBe("carline-list-p99-latency");
    expect(result.bands[0]?.phase).toBe("IN_PRODUCTION");
    expect(result.bands[0]?.capability_ref).toBe("PAGE.DASHBOARD");
  });
});

// ============================================================
// production evaluate（§95.2 Deterministic Detection 命令面）
// ============================================================

describe("pomaster production evaluate（三态判定 + 台账落账）", () => {
  it("未 init → NOT_INITIALIZED；band 不在册 → BAND_NOT_FOUND", async () => {
    const fresh = await runJson(["production", "evaluate", "any-band", "--value", "1"]);
    expect(fresh.code).toBe(1);
    expect(errorCodeOf(fresh.env)).toBe("NOT_INITIALIZED");
    await createStore(dir);
    const missing = await runJson(["production", "evaluate", "no-such-band", "--value", "1"]);
    expect(missing.code).toBe(1);
    expect(errorCodeOf(missing.env)).toBe("BAND_NOT_FOUND");
  });

  it("观测缺席（--value 与 --observations-file 均缺）→ OBSERVATION_NOT_EVALUABLE exit 1（fail-closed 非 fake 绿）", async () => {
    await createStore(dir);
    await defineBand();
    const missing = await runJson(["production", "evaluate", "carline-list-p99-latency"]);
    expect(missing.code).toBe(1);
    expect(missing.env.ok).toBe(false);
    expect(errorCodeOf(missing.env)).toBe("OBSERVATION_NOT_EVALUABLE");
    expect(existsSync(join(dir, ".pomaster/production/observations"))).toBe(false);
  });

  it("双观测源同给 → SCHEMA_INVALID（互斥且二选一）", async () => {
    await createStore(dir);
    await defineBand();
    const both = await runJson([
      "production",
      "evaluate",
      "carline-list-p99-latency",
      "--value",
      "500",
      "--observations-file",
      "obs.json",
    ]);
    expect(both.code).toBe(1);
    expect(errorCodeOf(both.env)).toBe("SCHEMA_INVALID");
  });

  it("OK 路径 → exit 0 status=OK + observation 台账落盘（breach_ref=null）", async () => {
    await createStore(dir);
    await defineBand();
    const { code, env } = await runJson(["production", "evaluate", "carline-list-p99-latency", "--value", "500"]);
    expect(code).toBe(0);
    const result = env.result as {
      status: string;
      value: number | null;
      observation_ref: string | null;
      evidence_ref: string | null;
      observation_path: string | null;
    };
    expect(result.status).toBe("OK");
    expect(result.value).toBe(500);
    expect(result.evidence_ref).toBeNull();
    expect(result.observation_ref).toMatch(/^POB-[0-9a-f]{12}$/);
    expect(existsSync(join(dir, ".pomaster/production/observations", `${result.observation_ref as string}.json`))).toBe(true);
    expect(existsSync(join(dir, ".pomaster/production/breaches"))).toBe(false);
  });

  it("BREACHED 路径 → exit 0 status=BREACHED + evidence 落账 + envelope evidence_ref（detected_by=tool_signal 落盘字面）", async () => {
    await createStore(dir);
    await defineBand();
    const { code, env } = await runJson(["production", "evaluate", "carline-list-p99-latency", "--value", "950"]);
    expect(code).toBe(0); // evaluate 是动作非判卷：BREACHED 是动作的成功产出
    const result = env.result as {
      status: string;
      value: number | null;
      detail: string | null;
      evidence_ref: string | null;
      evidence_path: string | null;
      observation_ref: string | null;
    };
    expect(result.status).toBe("BREACHED");
    expect(result.value).toBe(950);
    expect(result.evidence_ref).toMatch(/^PBR-[0-9a-f]{12}$/);
    expect(result.evidence_path).toBe(`.pomaster/production/breaches/${result.evidence_ref}.json`);
    const breach = JSON.parse(
      readFileSync(join(dir, ".pomaster/production/breaches", `${result.evidence_ref as string}.json`), "utf8"),
    ) as Record<string, unknown>;
    expect(breach.detected_by).toBe("tool_signal"); // C5：判定来自工具信号非 LLM 自报
    expect(breach.status).toBe("BREACHED");
    expect(breach.observation_ref).toBe(result.observation_ref);
  });

  it("非数值 --value → OBSERVATION_NOT_EVALUABLE；observations-file 缺席/坏 JSON/数组形态 → OBSERVATION_NOT_EVALUABLE", async () => {
    await createStore(dir);
    await defineBand();
    const nan = await runJson(["production", "evaluate", "carline-list-p99-latency", "--value", "abc"]);
    expect(nan.code).toBe(1);
    expect(errorCodeOf(nan.env)).toBe("OBSERVATION_NOT_EVALUABLE");
    const missingFile = await runJson([
      "production",
      "evaluate",
      "carline-list-p99-latency",
      "--observations-file",
      join(dir, "no-such-obs.json"),
    ]);
    expect(missingFile.code).toBe(1);
    expect(errorCodeOf(missingFile.env)).toBe("OBSERVATION_NOT_EVALUABLE");
    const badJson = join(dir, "bad.json");
    writeFileSync(badJson, "{not json", "utf8");
    const unparseable = await runJson([
      "production",
      "evaluate",
      "carline-list-p99-latency",
      "--observations-file",
      badJson,
    ]);
    expect(unparseable.code).toBe(1);
    expect(errorCodeOf(unparseable.env)).toBe("OBSERVATION_NOT_EVALUABLE");
    const arrayForm = join(dir, "array.json");
    writeFileSync(arrayForm, "[]", "utf8");
    const arrayed = await runJson([
      "production",
      "evaluate",
      "carline-list-p99-latency",
      "--observations-file",
      arrayForm,
    ]);
    expect(arrayed.code).toBe(1);
    expect(errorCodeOf(arrayed.env)).toBe("OBSERVATION_NOT_EVALUABLE");
  });

  it("指标名不匹配（observations-file）→ exit 1 NOT_EVALUABLE 显式入账（breach_ref=null）非静默丢弃", async () => {
    await createStore(dir);
    await defineBand();
    const obsFile = join(dir, "obs-mismatch.json");
    writeFileSync(
      obsFile,
      JSON.stringify({ metric_name: "other.metric.name", value: 950, observed_at_seq: 7 }),
      "utf8",
    );
    const { code, env } = await runJson([
      "production",
      "evaluate",
      "carline-list-p99-latency",
      "--observations-file",
      obsFile,
    ]);
    expect(code).toBe(1);
    expect(errorCodeOf(env)).toBe("OBSERVATION_NOT_EVALUABLE");
    const result = env.result as { status: string; detail: string | null; observation_ref: string | null };
    expect(result.status).toBe("NOT_EVALUABLE");
    expect(result.detail).toContain("METRIC_NAME_MISMATCH");
    // 显式入账（禁静默丢弃）：observation 台账在座且 evaluated_status=NOT_EVALUABLE。
    const onDisk = JSON.parse(
      readFileSync(join(dir, ".pomaster/production/observations", `${result.observation_ref as string}.json`), "utf8"),
    ) as Record<string, unknown>;
    expect(onDisk.evaluated_status).toBe("NOT_EVALUABLE");
    expect(onDisk.breach_ref).toBeNull();
  });
});

// ============================================================
// production challenge（§95.3 State Challenge 命令面）
// ============================================================

describe("pomaster production challenge（CURRENT+breach→CHALLENGED）", () => {
  it("未 init → NOT_INITIALIZED；无 band 直接 challenge → BAND_NOT_FOUND（链外捷径全断）", async () => {
    const fresh = await runJson(["production", "challenge", "PAGE.DASHBOARD", "--band", "x", "--evidence", "PBR-000000000000"]);
    expect(fresh.code).toBe(1);
    expect(errorCodeOf(fresh.env)).toBe("NOT_INITIALIZED");
    await seedCurrentObject();
    const noBand = await runJson(["production", "challenge", "PAGE.DASHBOARD", "--band", "no-such-band", "--evidence", "PBR-000000000000"]);
    expect(noBand.code).toBe(1);
    expect(errorCodeOf(noBand.env)).toBe("BAND_NOT_FOUND");
  });

  it("happy 链 → exit 0：change STABLE→CHALLENGED 落 truth index + challenge 留痕（authority=evidence 引用）", async () => {
    const store = await seedCurrentObject();
    const breachRef = await seedBreach();
    const { code, env } = await runJson([
      "production",
      "challenge",
      "PAGE.DASHBOARD",
      "--band",
      "carline-list-p99-latency",
      "--evidence",
      breachRef,
    ]);
    expect(code).toBe(0);
    expect(env.ok).toBe(true);
    const result = env.result as {
      challenge_ref: string | null;
      object_id: string;
      capability_ref: string | null;
      from_change: string | null;
      to_change: string | null;
      evidence_ref: string | null;
      authority_ref: string | null;
      applied_seq: number | null;
    };
    expect(result.challenge_ref).toMatch(/^PCH-[0-9a-f]{12}$/);
    expect(result.from_change).toBe("STABLE");
    expect(result.to_change).toBe("CHALLENGED");
    expect(result.evidence_ref).toBe(breachRef);
    expect(result.authority_ref).toBe(breachRef); // 工具信号引用即挑战权威
    expect(result.applied_seq).toBeGreaterThan(0);
    // truth index 落库断言（applyTransaction 通路——零旁路）。
    const index = await loadTruthIndex(store);
    const row = index.objects.find((candidate) => candidate.id === "PAGE.DASHBOARD");
    expect(row?.axes.change).toBe("CHALLENGED");
    expect(existsSync(join(dir, ".pomaster/production/challenges", `${result.challenge_ref as string}.json`))).toBe(true);
  });

  it("申报对象 ≠ band 挂载对象 → CHALLENGE_REJECTED；evidence 手造/缺席在册 → EVIDENCE_NOT_FOUND", async () => {
    await seedCurrentObject();
    await seedBreach();
    const mismatch = await runJson([
      "production",
      "challenge",
      "PAGE.OTHER",
      "--band",
      "carline-list-p99-latency",
      "--evidence",
      "PBR-000000000000",
    ]);
    expect(mismatch.code).toBe(1);
    expect(errorCodeOf(mismatch.env)).toBe("CHALLENGE_REJECTED");
    const fabricated = await runJson([
      "production",
      "challenge",
      "PAGE.DASHBOARD",
      "--band",
      "carline-list-p99-latency",
      "--evidence",
      "PBR-000000000000",
    ]);
    expect(fabricated.code).toBe(1);
    expect(errorCodeOf(fabricated.env)).toBe("EVIDENCE_NOT_FOUND");
    const malformed = await runJson([
      "production",
      "challenge",
      "PAGE.DASHBOARD",
      "--band",
      "carline-list-p99-latency",
      "--evidence",
      "not-a-breach-ref",
    ]);
    expect(malformed.code).toBe(1);
    expect(errorCodeOf(malformed.env)).toBe("EVIDENCE_NOT_FOUND");
  });

  it("重复 challenge → CHALLENGE_REJECTED（已 CHALLENGED 不重复发起）", async () => {
    await seedCurrentObject();
    const breachRef = await seedBreach();
    const args = ["production", "challenge", "PAGE.DASHBOARD", "--band", "carline-list-p99-latency", "--evidence", breachRef];
    const first = await runJson(args);
    expect(first.code).toBe(0);
    const repeat = await runJson(args);
    expect(repeat.code).toBe(1);
    expect(errorCodeOf(repeat.env)).toBe("CHALLENGE_REJECTED");
  });

  it("非 CURRENT（PROPOSED）对象 → CHALLENGE_REJECTED（§95.3 链头前置：Capability=CURRENT）", async () => {
    await seedCurrentObject({ id: "PAGE.OTHER", lifecycle: "PROPOSED" });
    await defineBand({ "band-id": "other-band", "--capability-ref": "PAGE.OTHER" });
    const evaluation = await runJson(["production", "evaluate", "other-band", "--value", "950"]);
    expect(evaluation.code).toBe(0);
    const breachRef = (evaluation.env.result as { evidence_ref: string }).evidence_ref;
    const { code, env } = await runJson([
      "production",
      "challenge",
      "PAGE.OTHER",
      "--band",
      "other-band",
      "--evidence",
      breachRef,
    ]);
    expect(code).toBe(1);
    expect(errorCodeOf(env)).toBe("CHALLENGE_REJECTED");
    // MIGRATING 拒绝面同 kernel TRANSITION_ILLEGAL 通路（kernel production.spec 已覆盖；
    // CLI 面的 change=MIGRATING 播种需 ACTIVE PERMIT——store 跨轴断言，不在此重复）。
  });
});

// ============================================================
// production diagnose（Agent Diagnosis 消费位）
// ============================================================

describe("pomaster production diagnose（无 breach evidence 结构性拒绝）", () => {
  async function seededChallenge(): Promise<{ breachRef: string; challengeRef: string }> {
    await seedCurrentObject();
    const breachRef = await seedBreach();
    const challenge = await runJson([
      "production",
      "challenge",
      "PAGE.DASHBOARD",
      "--band",
      "carline-list-p99-latency",
      "--evidence",
      breachRef,
    ]);
    expect(challenge.code).toBe(0);
    const challengeRef = (challenge.env.result as { challenge_ref: string }).challenge_ref;
    return { breachRef, challengeRef };
  }

  it("未 init → NOT_INITIALIZED；challenge 不在册 → DIAGNOSIS_WITHOUT_BREACH_EVIDENCE exit 1（§95.2 链序封条）", async () => {
    const fresh = await runJson(["production", "diagnose", "PCH-000000000000", "--kind", "CONFIG_ISSUE", "--notes", "x"]);
    expect(fresh.code).toBe(1);
    expect(errorCodeOf(fresh.env)).toBe("NOT_INITIALIZED");
    await createStore(dir);
    const noChallenge = await runJson(["production", "diagnose", "PCH-000000000000", "--kind", "CONFIG_ISSUE", "--notes", "x"]);
    expect(noChallenge.code).toBe(1);
    expect(noChallenge.env.ok).toBe(false);
    expect(errorCodeOf(noChallenge.env)).toBe("DIAGNOSIS_WITHOUT_BREACH_EVIDENCE");
  });

  it("happy 链 → exit 0：kind/notes/actor 留痕 + breach 引用保序（链尾三分落点）", async () => {
    const { breachRef, challengeRef } = await seededChallenge();
    const { code, env } = await runJson([
      "production",
      "diagnose",
      challengeRef,
      "--kind",
      "CONFIG_ISSUE",
      "--notes",
      "阈值 800 是压测前口径——配置回填即可恢复（引用 breach 事实面）",
    ]);
    expect(code).toBe(0);
    const result = env.result as {
      diagnosis_ref: string | null;
      challenge_ref: string | null;
      breach_ref: string | null;
      kind: string | null;
      diagnosed_by: { actor_type: string; actor: string } | null;
    };
    expect(result.diagnosis_ref).toMatch(/^PDG-[0-9a-f]{12}$/);
    expect(result.challenge_ref).toBe(challengeRef);
    expect(result.breach_ref).toBe(breachRef); // diagnosis 必持既有 breach Evidence 引用
    expect(result.kind).toBe("CONFIG_ISSUE");
    expect(existsSync(join(dir, ".pomaster/production/diagnoses", `${result.diagnosis_ref as string}.json`))).toBe(true);
  });

  it("kind 词表外 / notes 缺席 → SCHEMA_INVALID（词形闭包 + 留痕必填）", async () => {
    const { challengeRef } = await seededChallenge();
    const badKind = await runJson(["production", "diagnose", challengeRef, "--kind", "VIBE_ISSUE", "--notes", "x"]);
    expect(badKind.code).toBe(1);
    expect(errorCodeOf(badKind.env)).toBe("SCHEMA_INVALID");
    const noNotes = await runJson(["production", "diagnose", challengeRef, "--kind", "CONFIG_ISSUE"]);
    expect(noNotes.code).toBe(1);
    expect(errorCodeOf(noNotes.env)).toBe("SCHEMA_INVALID");
  });
});

// ============================================================
// production metrics（§55.1 八能力 Leading/Lagging 呈现）
// ============================================================

describe("pomaster production metrics（八能力表 + 可算/不可算分账）", () => {
  it("空台账 → exit 0：十六指标全 NOT_MEASURABLE_YET（value=null + reason 非空）+ caveat 恒输出", async () => {
    const { code, env, io } = await runJson(["production", "metrics"]);
    expect(code).toBe(0);
    const result = env.result as {
      action: string;
      caveat: string;
      runs_scanned: number;
      runs_unreadable: number;
      rows: {
        capability: string;
        leading_metric: { status: string; value: number | null; reason: string | null };
        lagging_metric: { status: string; value: number | null; reason: string | null };
      }[];
    };
    expect(result.action).toBe("metrics");
    expect(result.rows).toHaveLength(8);
    expect(result.caveat).toContain("Metrics 用于风险提示，不直接替代专业判断");
    const metrics = result.rows.flatMap((row) => [row.leading_metric, row.lagging_metric]);
    expect(metrics).toHaveLength(16);
    for (const metric of metrics) {
      expect(metric.status).toBe("NOT_MEASURABLE_YET");
      expect(metric.value).toBeNull();
      expect(metric.reason).not.toBeNull();
    }
    expect(io.out.join("\n")).toContain("NOT_MEASURABLE_YET");
    expect(io.out.join("\n")).toContain("Metrics 用于风险提示");
  });

  it("seed gate 运行台账 → MEASURED 数值 + 分账呈现（计数反映既有 gate/evidence 数据）", async () => {
    await createStore(dir);
    seedGateRun("GRN-GAUNTLET-1", "GAUNTLET", "passed", { subjectId: "PAGE.DASHBOARD", ranAtSeq: 1 });
    seedGateRun("GRN-GAUNTLET-2", "GAUNTLET", "failed", { subjectId: "PAGE.CHECKOUT", ranAtSeq: 2 });
    seedGateRun("GRN-ARCH-1", "ARCHITECTURE", "blocked", { ranAtSeq: 3 });
    const { code, env } = await runJson(["production", "metrics"]);
    expect(code).toBe(0);
    const result = env.result as {
      runs_scanned: number;
      rows: {
        capability: string;
        leading_metric: { key: string; status: string; value: number | null; numerator: number | null; denominator: number | null };
        lagging_metric: { key: string; status: string; value: number | null };
      }[];
    };
    expect(result.runs_scanned).toBe(3);
    const gauntletRow = result.rows.find((row) => row.capability === "Gauntlet");
    expect(gauntletRow?.leading_metric.status).toBe("MEASURED");
    expect(gauntletRow?.leading_metric.key).toBe("gauntlet_first_pass_pass_rate");
    expect(gauntletRow?.leading_metric.value).toBe(0.5); // 首次运行 1 passed / 2 subjects
    expect(gauntletRow?.leading_metric.denominator).toBe(2);
    const archRow = result.rows.find((row) => row.capability === "Architecture Gate");
    expect(archRow?.leading_metric.status).toBe("MEASURED");
    expect(archRow?.leading_metric.value).toBe(1); // verdict=blocked 拦截计数
    // 有台账也不改变缺信号源指标的显式缺席（可算/不可算分账）。
    const brainstormRow = result.rows.find((row) => row.capability === "Brainstorm");
    expect(brainstormRow?.leading_metric.status).toBe("NOT_MEASURABLE_YET");
  });
});

// ============================================================
// production self-improvement（§90.4 呈报位——不得自动应用）
// ============================================================

describe("pomaster production self-improvement register/list（§90.4 恒呈报态）", () => {
  it("未 init → NOT_INITIALIZED；词表外 signal / 缺 note → SCHEMA_INVALID", async () => {
    const fresh = await runJson(["production", "self-improvement", "register", "--signal", "context_oversized_low_utilization", "--note", "x"]);
    expect(fresh.code).toBe(1);
    expect(errorCodeOf(fresh.env)).toBe("NOT_INITIALIZED");
    await createStore(dir);
    const badSignal = await runJson(["production", "self-improvement", "register", "--signal", "vibe_good", "--note", "x"]);
    expect(badSignal.code).toBe(1);
    expect(errorCodeOf(badSignal.env)).toBe("SCHEMA_INVALID");
    const noNote = await runJson(["production", "self-improvement", "register", "--signal", "context_oversized_low_utilization"]);
    expect(noNote.code).toBe(1);
    expect(errorCodeOf(noNote.env)).toBe("SCHEMA_INVALID");
  });

  it("happy 登记三层封条 → exit 0 + result.no_auto_apply=true + warnings 码位 + 人读「不得自动应用」（零 state/ 写入）", async () => {
    await createStore(dir);
    const stateBefore = existsSync(join(dir, ".pomaster/state/journal.jsonl"))
      ? readFileSync(join(dir, ".pomaster/state/journal.jsonl"), "utf8")
      : "";
    const { code, env, io } = await runJson([
      "production",
      "self-improvement",
      "register",
      "--signal",
      "context_oversized_low_utilization",
      "--note",
      "ctx 200k/命中 3%（CLI 呈报样本）",
      "--evidence-ref",
      "GRN-PROBE-1",
    ]);
    expect(code).toBe(0);
    expect(env.ok).toBe(true);
    const result = env.result as {
      id: string;
      kind: string;
      signal: string;
      signal_label: string;
      no_auto_apply: boolean;
      path: string;
    };
    expect(result.id).toMatch(/^PSI-[0-9a-f]{12}$/);
    expect(result.kind).toBe("POMASTER_SELF_IMPROVEMENT_CANDIDATE"); // L5695 逐字产物词形
    expect(result.signal_label).toBe("Context 长期过大但实际使用率低");
    expect(result.no_auto_apply).toBe(true);
    expect(warningCodesOf(env)).toContain("POMASTER_SELF_IMPROVEMENT_CANDIDATE");
    expect(io.out.join("\n")).toContain("不得自动应用");
    expect(existsSync(join(dir, ".pomaster/production/self-improvement", `${result.id}.json`))).toBe(true);
    // 零 journal 写入（登记即呈报——无任何自动应用通路的事件面）。
    const stateAfter = existsSync(join(dir, ".pomaster/state/journal.jsonl"))
      ? readFileSync(join(dir, ".pomaster/state/journal.jsonl"), "utf8")
      : "";
    expect(stateAfter).toBe(stateBefore);
  });

  it("重复登记（同 signal+note 内容寻址撞册）→ SCHEMA_INVALID", async () => {
    await createStore(dir);
    const args = [
      "production",
      "self-improvement",
      "register",
      "--signal",
      "gate_high_frequency_false_positive",
      "--note",
      "重复样本",
    ];
    const first = await runJson(args);
    expect(first.code).toBe(0);
    const again = await runJson(args);
    expect(again.code).toBe(1);
    expect(errorCodeOf(again.env)).toBe("SCHEMA_INVALID");
  });

  it("list：空 → 显式空合法态；登记后 → 条目 + no_auto_apply=true + 人读注记（纯读零写入）", async () => {
    const empty = await runJson(["production", "self-improvement", "list"]);
    expect(empty.code).toBe(0);
    expect((empty.env.result as { total: number; candidates: unknown[] }).total).toBe(0);
    const emptyHuman = capture();
    expect(await runCli(["--dir", dir, "production", "self-improvement", "list"], emptyHuman)).toBe(0);
    expect(emptyHuman.out.join("\n")).toContain("显式空");
    await createStore(dir);
    await runJson([
      "production",
      "self-improvement",
      "register",
      "--signal",
      "profile_frequent_manual_deescalation",
      "--note",
      "Router 过度保守样本",
    ]);
    const listed = await runJson(["production", "self-improvement", "list"]);
    expect(listed.code).toBe(0);
    const result = listed.env.result as {
      total: number;
      candidates: { signal: string; kind: string; no_auto_apply: boolean; signal_label: string }[];
    };
    expect(result.total).toBe(1);
    expect(result.candidates[0]?.signal).toBe("profile_frequent_manual_deescalation");
    expect(result.candidates[0]?.kind).toBe("POMASTER_SELF_IMPROVEMENT_CANDIDATE");
    expect(result.candidates[0]?.no_auto_apply).toBe(true);
    expect(result.candidates[0]?.signal_label).toBe("Profile 经常被人工降级，说明 Router 过度保守");
    const listHuman = capture();
    expect(await runCli(["--dir", dir, "production", "self-improvement", "list"], listHuman)).toBe(0);
    expect(listHuman.out.join("\n")).toContain("不得自动应用");
  });
});

// ============================================================
// 人读输出（非 --json）与 --help 词形面
// ============================================================

describe("production 命令面人读输出与 --help", () => {
  it("非 --json：evaluate BREACHED 人读行走 stdout（工具信号 + 下一步指路）", async () => {
    await createStore(dir);
    await defineBand();
    const io = capture();
    const code = await runCli(["--dir", dir, "production", "evaluate", "carline-list-p99-latency", "--value", "950"], io);
    expect(code).toBe(0);
    const text = [...io.out, ...io.err].join("\n");
    expect(text).toContain("BREACHED");
    expect(text).toContain("tool_signal");
    expect(text).toContain("challenge");
  });

  it("production --help 呈现全子命令词形（band/evaluate/challenge/diagnose/metrics/self-improvement）", async () => {
    const io = capture();
    const code = await runCli(["production", "--help"], io);
    expect(code).toBe(0);
    const text = [...io.out, ...io.err].join("\n");
    for (const word of ["band", "evaluate", "challenge", "diagnose", "metrics", "self-improvement"]) {
      expect(text).toContain(word);
    }
  });
});
