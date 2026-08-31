/**
 * production-feedback-chain.spec.ts —— §95.2「Tool Detects, Agent Diagnoses」链端到端
 * 集成（P34b）。
 *
 * PRD §95.2（L6121-6140 逐字链序）：生产异常必须优先由确定性 Observation 触发：
 *
 *   metric / log / error budget / SLO / control band
 *           ↓
 *   Deterministic Detection   ← evaluate（三态纯函数判定；BREACHED 产 Evidence，
 *                                 detected_by=tool_signal——零 LLM 判定位）
 *           ↓
 *   Evidence                  ← .pomaster/production/breaches/PBR-*.json 落账断言
 *           ↓
 *   State Challenge           ← challenge（§95.3：CURRENT + breach → change 轴
 *                                 STABLE→CHALLENGED；走 applyTransaction 零旁路）
 *           ↓
 *   Agent Diagnosis           ← diagnose（CONFIG_ISSUE 引用既有 breach——无 breach
 *                                 evidence 的 diagnosis 结构性拒绝）
 *
 * 链外捷径全断（本文件第二半）：
 * - 无 band 直接 challenge → BAND_NOT_FOUND；
 * - band 在册但 evidence 手造 → EVIDENCE_NOT_FOUND；
 * - 无 breach 的 diagnosis → DIAGNOSIS_WITHOUT_BREACH_EVIDENCE；
 * - evaluate 缺 observation → OBSERVATION_NOT_EVALUABLE（fail-closed 非 fake 绿）。
 *
 * §90.4 封条的测试级钉死（字节可判定）：self-improvement register 全程 .pomaster/state
 * 树 sha256 集前后相等（登记即呈报——零 journal 事件零 state/ 写入，无任何自动应用
 * 通路）；evaluate 与 diagnose 同样零 state/ 触碰（challenge 是链中唯一治理事实变更，
 * delta 恰 = {truth-index.json, journal.jsonl}——applyTransaction 既有落点）。
 *
 * 测试卫生：fixture mkdtemp（pomaster-p34-fixture- 前缀）+ afterEach 整树删除；真实
 * home 绝不触碰。全链真 CLI 入口（runCli 同进程直连——Windows 安全，不 spawn shell）。
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore, loadTruthIndex, type Store, type Transaction } from "@pomaster/kernel";
import { runCli, type CliEnvelope } from "@pomaster/cli";

// ============================================================
// fixture 与工具
// ============================================================

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "pomaster-p34-fixture-chain-"));
  roots.push(root);
  return root;
}

function stateTreeHash(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const stateDir = join(dir, ".pomaster", "state");
  if (!existsNoThrow(stateDir)) return out;
  const walk = (current: string, rel: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const relName = rel.length > 0 ? `${rel}/${entry.name}` : entry.name;
      if (entry.isFile()) {
        out.set(
          relName,
          createHash("sha256").update(readFileSync(`${current}/${entry.name}`)).digest("hex"),
        );
      } else {
        walk(`${current}/${entry.name}`, relName);
      }
    }
  };
  walk(stateDir, "");
  return out;
}

function existsNoThrow(path: string): boolean {
  try {
    readdirSync(path);
    return true;
  } catch {
    return false;
  }
}

function expectSameTree(before: Map<string, string>, after: Map<string, string>): void {
  const changed = [
    ...[...before.keys()].filter((key) => after.get(key) !== before.get(key)),
    ...[...after.keys()].filter((key) => !before.has(key)),
    ...[...before.keys()].filter((key) => !after.has(key)),
  ];
  expect(changed).toEqual([]);
}

async function runJson(
  root: string,
  args: readonly string[],
): Promise<{ code: number; env: CliEnvelope<Record<string, unknown>>; stdout: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(["--dir", root, ...args, "--json"], {
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  });
  return { code, env: JSON.parse(out.join("\n")) as CliEnvelope<Record<string, unknown>>, stdout: out.join("\n") };
}

function errorCodeOf(env: CliEnvelope<Record<string, unknown>>): string {
  const errors = env.errors as { code: string }[] | undefined;
  return errors?.[0]?.code ?? "(no errors)";
}

/** 项目基线：store + 一件 Capability=CURRENT/change=STABLE 对象（§95.3 链头）。 */
async function makeProject(root: string): Promise<Store> {
  await createStore(root);
  const authorityPath = join(root, ".pomaster", "state", "authority.json");
  const authority = JSON.parse(readFileSync(authorityPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  authority.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authorityPath, `${JSON.stringify(authority, null, 2)}\n`);
  const store = await createStore(root);
  const envelope = {
    id: "PAGE.CARLINE.LIST",
    kind: "page_surface",
    axisProfile: "page_default",
    axes: {
      lifecycle: "CURRENT",
      confidence: "PROVISIONAL",
      evidence: "IMPLEMENTED",
      change: "STABLE",
    },
    titleZh: "车型列表页",
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: { surface: "V1" },
  };
  const ops: Transaction["ops"] = [{ op: "upsert_object", envelope: envelope as never }];
  await applyTransaction(store, { ops });
  return store;
}

/** gate 运行台账 fixture（07 run_record inline 形态直落 evidence/runs/——§55.1 指标分母）。 */
function seedGateRun(
  root: string,
  grn: string,
  gate: string,
  verdict: string,
  options: { subjectId?: string | null; ranAtSeq?: number } = {},
): void {
  const runsDir = join(root, ".pomaster", "evidence", "runs");
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
        tool: "spec:production-chain-fixture",
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
  const journalPath = join(root, ".pomaster", "state", "journal.jsonl");
  mkdirSync(join(root, ".pomaster", "state"), { recursive: true });
  const seq = options.ranAtSeq ?? 1;
  appendFileSync(
    journalPath,
    `${JSON.stringify({ type: "TX_APPLIED", seq, authority_ref: null, execution_id: null, note: null, ops: ["record_gate_run"], changed_object_ids: [], digest_warnings: 0 })}\n`,
    "utf8",
  );
}

// ============================================================
// §95.2 链端到端
// ============================================================

describe("§95.2 Production Feedback 链端到端（Detection→Evidence→Challenge→Diagnosis→Metrics）", () => {
  it("全链：band define → evaluate BREACHED（evidence 落账）→ challenge（CURRENT→CHALLENGED）→ diagnose（引用 breach）→ metrics 计数反映 → 链外捷径全断 → self-improvement 恒呈报态", async () => {
    const root = fixtureRoot();
    const store = await makeProject(root);
    const snapshot0 = stateTreeHash(root);
    expect(snapshot0.size).toBeGreaterThan(0);

    // —— 1) band define：performance 指标控制带（§95.2 链首信号源 metric） ——
    const defined = await runJson(root, [
      "production",
      "band",
      "define",
      "carline-list-p99-latency",
      "--title",
      "车型列表接口 p99 延迟控制带",
      "--capability-ref",
      "PAGE.CARLINE.LIST",
      "--source",
      "metric",
      "--metric-name",
      "http.server.requests.p99_ms",
      "--operator",
      "gt",
      "--threshold",
      "800",
    ]);
    expect(defined.code).toBe(0);
    const bandResult = defined.env.result as { id: string; phase: string; path: string };
    expect(bandResult.phase).toBe("IN_PRODUCTION"); // §30 第四态（§95.1 生命周期扩展承载）
    expect(existsSync(join(root, ".pomaster/production/bands/carline-list-p99-latency.json"))).toBe(true);
    expectSameTree(snapshot0, stateTreeHash(root)); // band define 零 state/ 写入

    // —— 2) 链外捷径预断①：无 breach evidence 的 diagnosis（链未启动即拒绝） ——
    const prematureDiagnosis = await runJson(root, [
      "production",
      "diagnose",
      "PCH-000000000000",
      "--kind",
      "CONFIG_ISSUE",
      "--notes",
      "链外捷径——无 challenge 在册",
    ]);
    expect(prematureDiagnosis.code).toBe(1);
    expect(errorCodeOf(prematureDiagnosis.env)).toBe("DIAGNOSIS_WITHOUT_BREACH_EVIDENCE");

    // —— 3) evaluate：注入越界 observation（950 > 800）→ BREACHED ——
    const evaluate = await runJson(root, [
      "production",
      "evaluate",
      "carline-list-p99-latency",
      "--value",
      "950",
    ]);
    expect(evaluate.code).toBe(0); // evaluate 是动作非判卷：BREACHED 是确定性检测的成功产出
    const evalResult = evaluate.env.result as {
      status: string;
      value: number | null;
      detail: string | null;
      observation_ref: string | null;
      evidence_ref: string | null;
      evidence_path: string | null;
    };
    expect(evalResult.status).toBe("BREACHED");
    expect(evalResult.value).toBe(950);
    expect(evalResult.detail).toContain("predicate: http.server.requests.p99_ms=950 gt 800");
    const breachRef = evalResult.evidence_ref as string;
    expect(breachRef).toMatch(/^PBR-[0-9a-f]{12}$/);
    // Evidence 落账断言（§95.2 链第 2 拍：detected_by 恒 tool_signal——零 LLM 判定位）。
    const evidencePath = join(root, ".pomaster/production/breaches", `${breachRef}.json`);
    expect(existsSync(evidencePath)).toBe(true);
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as Record<string, unknown>;
    expect(evidence.detected_by).toBe("tool_signal");
    expect(evidence.status).toBe("BREACHED");
    expect(evidence.band_id).toBe("carline-list-p99-latency");
    expect(evidence.capability_ref).toBe("PAGE.CARLINE.LIST");
    expect(evidence.value).toBe(950);
    expect(evidence.observation_ref).toBe(evalResult.observation_ref);
    // observation 台账在座（§95.2 Deterministic Detection 的输入留痕）。
    expect(
      existsSync(join(root, ".pomaster/production/observations", `${evalResult.observation_ref as string}.json`)),
    ).toBe(true);
    expectSameTree(snapshot0, stateTreeHash(root)); // evaluate 零 state/ 写入（台账是 production 侧车）

    // —— 4) 链外捷径预断②：evidence 手造（PBR 词形合法但不在册） ——
    const fabricated = await runJson(root, [
      "production",
      "challenge",
      "PAGE.CARLINE.LIST",
      "--band",
      "carline-list-p99-latency",
      "--evidence",
      "PBR-000000000000",
    ]);
    expect(fabricated.code).toBe(1);
    expect(errorCodeOf(fabricated.env)).toBe("EVIDENCE_NOT_FOUND");

    // —— 5) challenge：State Challenge（§95.3 CURRENT + breach → CHALLENGED） ——
    const challenge = await runJson(root, [
      "production",
      "challenge",
      "PAGE.CARLINE.LIST",
      "--band",
      "carline-list-p99-latency",
      "--evidence",
      breachRef,
    ]);
    expect(challenge.code).toBe(0);
    const challengeResult = challenge.env.result as {
      challenge_ref: string | null;
      from_change: string | null;
      to_change: string | null;
      evidence_ref: string | null;
      authority_ref: string | null;
      applied_seq: number | null;
    };
    expect(challengeResult.from_change).toBe("STABLE");
    expect(challengeResult.to_change).toBe("CHALLENGED");
    expect(challengeResult.evidence_ref).toBe(breachRef);
    expect(challengeResult.authority_ref).toBe(breachRef); // 确定性工具信号即挑战权威
    const challengeRef = challengeResult.challenge_ref as string;
    // change 轴转 CHALLENGED 落 truth index（applyTransaction 既有通路——零旁路）。
    const index = await loadTruthIndex(store);
    const row = index.objects.find((candidate) => candidate.id === "PAGE.CARLINE.LIST");
    expect(row?.axes.lifecycle).toBe("CURRENT");
    expect(row?.axes.change).toBe("CHALLENGED");
    // challenge 留痕（事务结果镜像）断言 evidence 引用。
    const challengeRecord = JSON.parse(
      readFileSync(join(root, ".pomaster/production/challenges", `${challengeRef}.json`), "utf8"),
    ) as Record<string, unknown>;
    expect(challengeRecord.breach_ref).toBe(breachRef);
    expect(challengeRecord.authority_ref).toBe(breachRef);
    expect(challengeRecord.to_change).toBe("CHALLENGED");
    // 链中唯一治理事实变更：state 树 delta 恰 = {truth-index.json, journal.jsonl}
    // （本断言树为 .pomaster/state；truth/objects 对象体镜像重写属 applyTransaction
    // 既有落点，不在本树口径内——红队 NOTE 勘正：头注原「恰 =」口径过窄已注记）。
    const snapshot1 = stateTreeHash(root);
    const changed = [
      ...[...snapshot1.keys()].filter((key) => snapshot0.get(key) !== snapshot1.get(key)),
      ...[...snapshot1.keys()].filter((key) => !snapshot0.has(key)),
    ];
    expect([...changed].sort()).toEqual(["journal.jsonl", "truth-index.json"]);

    // —— 6) 链外捷径预断③：重复 challenge（对象已 CHALLENGED） ——
    const repeatChallenge = await runJson(root, [
      "production",
      "challenge",
      "PAGE.CARLINE.LIST",
      "--band",
      "carline-list-p99-latency",
      "--evidence",
      breachRef,
    ]);
    expect(repeatChallenge.code).toBe(1);
    expect(errorCodeOf(repeatChallenge.env)).toBe("CHALLENGE_REJECTED");

    // —— 7) diagnose：Agent Diagnosis（CONFIG_ISSUE 引用既有 breach——链序第 4 拍） ——
    const diagnose = await runJson(root, [
      "production",
      "diagnose",
      challengeRef,
      "--kind",
      "CONFIG_ISSUE",
      "--notes",
      "p99 阈值 800ms 是压测前口径，网关超时配置未随容量扩容回填（引用 breach 事实面：950>800）",
    ]);
    expect(diagnose.code).toBe(0);
    const diagResult = diagnose.env.result as {
      diagnosis_ref: string | null;
      breach_ref: string | null;
      challenge_ref: string | null;
      kind: string | null;
    };
    expect(diagResult.kind).toBe("CONFIG_ISSUE");
    expect(diagResult.breach_ref).toBe(breachRef);
    expect(diagResult.challenge_ref).toBe(challengeRef);
    expect(
      existsSync(join(root, ".pomaster/production/diagnoses", `${diagResult.diagnosis_ref as string}.json`)),
    ).toBe(true);
    const diagnosisRecord = JSON.parse(
      readFileSync(join(root, ".pomaster/production/diagnoses", `${diagResult.diagnosis_ref as string}.json`), "utf8"),
    ) as Record<string, unknown>;
    expect(diagnosisRecord.breach_ref).toBe(breachRef); // diagnosis 必持既有 breach Evidence 引用
    expectSameTree(snapshot1, stateTreeHash(root)); // diagnose 零 state/ 写入

    // —— 8) metrics：§55.1 计数反映（挂钩既有 gate/evidence 数据；链产物不冒充数值） ——
    seedGateRun(root, "GRN-GAUNTLET-A1", "GAUNTLET", "passed", { subjectId: "PAGE.CARLINE.LIST", ranAtSeq: 1 });
    seedGateRun(root, "GRN-GAUNTLET-A2", "GAUNTLET", "failed", { subjectId: "PAGE.CARLINE.SETTLE", ranAtSeq: 2 });
    seedGateRun(root, "GRN-ARCH-A1", "ARCHITECTURE", "blocked", { ranAtSeq: 3 });
    // seedGateRun 的合法 journal 锚追加在 snapshot1 之后——后续「零 state 写入」断言
    // 基准改从 seed 之后的树取（metrics/捷径/self-improvement 段共用）。
    const snapshotAfterSeeds = stateTreeHash(root);
    const metrics = await runJson(root, ["production", "metrics"]);
    expect(metrics.code).toBe(0);
    const metricsResult = metrics.env.result as {
      caveat: string;
      runs_scanned: number;
      runs_unreadable: number;
      rows: {
        capability: string;
        leading_metric: { key: string; status: string; value: number | null; denominator: number | null };
        lagging_metric: { key: string; status: string; value: number | null; reason: string | null };
      }[];
    };
    expect(metricsResult.runs_scanned).toBe(3);
    expect(metricsResult.runs_unreadable).toBe(0);
    expect(metricsResult.caveat).toContain("Metrics 用于风险提示，不直接替代专业判断");
    const gauntletRow = metricsResult.rows.find((row) => row.capability === "Gauntlet");
    expect(gauntletRow?.leading_metric.key).toBe("gauntlet_first_pass_pass_rate");
    expect(gauntletRow?.leading_metric.status).toBe("MEASURED");
    expect(gauntletRow?.leading_metric.value).toBe(0.5); // 1 passed / 2 subjects（首次运行判卷面）
    const archRow = metricsResult.rows.find((row) => row.capability === "Architecture Gate");
    expect(archRow?.leading_metric.status).toBe("MEASURED");
    expect(archRow?.leading_metric.value).toBe(1); // ARCHITECTURE verdict=blocked 拦截计数
    // §95.2 链的 Production Change 台账不冒充 §55.1 数值（production_change_failure_rate
    // 显式 NOT_MEASURABLE_YET——v1 链刚落地样本面未建，缺席显式）。
    const gauntletLagging = metricsResult.rows.find((row) => row.capability === "Gauntlet")?.lagging_metric;
    expect(gauntletLagging?.key).toBe("production_change_failure_rate");
    expect(gauntletLagging?.status).toBe("NOT_MEASURABLE_YET");
    expect(gauntletLagging?.value).toBeNull();
    expect(gauntletLagging?.reason).not.toBeNull();

    // —— 9) 链外捷径全断复核（链启动后仍然全断） ——
    // 9a. 无 band 直接 challenge → BAND_NOT_FOUND。
    const noBand = await runJson(root, [
      "production",
      "challenge",
      "PAGE.CARLINE.LIST",
      "--band",
      "no-such-band",
      "--evidence",
      breachRef,
    ]);
    expect(noBand.code).toBe(1);
    expect(errorCodeOf(noBand.env)).toBe("BAND_NOT_FOUND");
    // 9b. evaluate 缺 observation → OBSERVATION_NOT_EVALUABLE（fail-closed 非 fake 绿）。
    const noObservation = await runJson(root, ["production", "evaluate", "carline-list-p99-latency"]);
    expect(noObservation.code).toBe(1);
    expect(noObservation.env.ok).toBe(false);
    expect(errorCodeOf(noObservation.env)).toBe("OBSERVATION_NOT_EVALUABLE");
    expectSameTree(snapshotAfterSeeds, stateTreeHash(root)); // 捷径拒绝零 state/ 写入

    // —— 10) self-improvement：§90.4 登记恒呈报态（零 state/ 写入 = 无自动应用通路） ——
    const register = await runJson(root, [
      "production",
      "self-improvement",
      "register",
      "--signal",
      "repeated_architecture_challenge",
      "--note",
      "同类 p99 阈值击穿在架构评审重复出现（§95.2 链产物呈报）",
      "--evidence-ref",
      breachRef,
    ]);
    expect(register.code).toBe(0);
    const registerResult = register.env.result as {
      id: string;
      kind: string;
      signal: string;
      no_auto_apply: boolean;
    };
    expect(registerResult.kind).toBe("POMASTER_SELF_IMPROVEMENT_CANDIDATE"); // L5695 逐字
    expect(registerResult.no_auto_apply).toBe(true);
    expect(existsSync(join(root, ".pomaster/production/self-improvement", `${registerResult.id}.json`))).toBe(true);
    expectSameTree(snapshotAfterSeeds, stateTreeHash(root)); // 登记即呈报：零 journal 零 state/（§90.4 封条）
    const listed = await runJson(root, ["production", "self-improvement", "list"]);
    expect(listed.code).toBe(0);
    const listResult = listed.env.result as {
      total: number;
      candidates: { id: string; kind: string; no_auto_apply: boolean }[];
    };
    expect(listResult.total).toBe(1);
    expect(listResult.candidates[0]?.id).toBe(registerResult.id);
    expect(listResult.candidates[0]?.no_auto_apply).toBe(true);
  });
});
