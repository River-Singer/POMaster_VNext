/**
 * golden-path.spec.ts —— Golden Path 行为验收协议（T1 · 战役 09-08-sc-t1 十条立红）。
 *
 * 战役定位（父 PRD 裁决 D-3/D-6/D-7）：把审计二的 10 条行为验收固化为可执行协议并
 * 立红，作为整个战役红→绿的驱动器。诚实区分两层：
 * - **机器断言**（本文件，deterministic 行为测试，进 CI 棘轮）：CLI 信封/落盘字节的
 *   行为级断言；
 * - **人工留痕判据**（tests/golden-path/README.md 协议文档 + MASTer 出口演练轮）：
 *   Agent 行为面不伪装自动化。
 *
 * 诚实纪律（禁 skip 掩盖红）：
 * - 已知红用 `it.fails`（vitest 预期失败形态）显式立红，用例名携带 `[RED→T2]`/
 *   `[RED→T3]`/`[RED→T4]` 归属标注，并在用例内先用「链健康前置断言」（当前绿）
 *   锚定失败发生在目标断言上；
 * - 当前绿的机制项用普通 `it`，用例名携带 `[GREEN-机制]`；
 * - 棘轮语义：对应子任务（T2）修复后，`it.fails` 用例会转为「预期外通过」而红——
 *   这是有意设计：提醒摘掉 fails 帽子（同时按各条转绿条件补链上新旗标参数）。
 * - **T2（09-08-sc-t2）摘帽轮**：GP-1/GP-4/GP-5/GP-7/GP-9 五条已按 red-ratchet
 *   三步纪律摘帽（断言正向站立 + 补新信号断言 + check.jsonl 留痕），用例名携带
 *   `[T2已摘帽]`；另增 `[T2新增信号]` 用例钉 R5 baseline 收口路由。
 *
 * 测试床（D-6）：scripts/generate-golden-fixture.mjs 确定性生成的最小真实形态
 * Vue3 工程（产物生成到 tmpdir，不入 git；零墙钟，两次生成字节一致）。
 * 命令面全部经 runCli in-process 真跑（L2 集成纪律），共享助手直接复用
 * tests/integration/fixture-chain-lib.ts（单一实现零漂移）。
 *
 * 链健康金丝雀：beforeAll 捕获链路记录零断言（防 chain 半途 expect 抖动全红）；
 * [GREEN-机制] 用例同时充当链路健康金丝雀——链断裂时它们会响，RED 用例的
 * 「预期失败」不会掩盖链路本身的坏损。
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { envelopeOf, runJsonStep, type StepRecord } from "../integration/fixture-chain-lib.js";

// ============================================================
// 常量（fixture / 链锚 / 词形闭包）
// ============================================================

const GENERATOR_SCRIPT = fileURLToPath(new URL("../../scripts/generate-golden-fixture.mjs", import.meta.url));

const DISCOVERY_ID = "golden-path-demo";
const TASK_ID = "TASK.GOLDEN_PATH_DEMO";
/** raw prompt（brainstorm start --prompt 登记；GP-4 转绿后 intent 应可回溯此 goal 文本）。 */
const RAW_PROMPT = "金路径验收链：仪表盘数据表格封装策略收敛——先观察 fixture 技术栈再收敛表格方案";
/** GP-4 断言用的 goal 文本 distinctive 子串（promote 后 intent 不再是泛化投影文案）。 */
const GOAL_PHRASE = "数据表格封装策略";

/** question-gate 处置词形六值闭包（kernel QuestionVerdict；PRD §80.4 词形冻结）。 */
const QUESTION_VERDICTS: readonly string[] = [
  "ASK_HUMAN",
  "ASK_REJECTED",
  "DERIVABLE",
  "RESEARCHABLE",
  "DEFERABLE",
  "ASSUMPTION",
];

/** GP-1 可观察事实键（fixture package.json 可机器观察的 stack.yaml 键；css 走问人面不在列）。 */
const OBSERVABLE_STACK_KEYS: readonly string[] = [
  "framework",
  "language",
  "build",
  "router",
  "state",
  "grid",
  "ui",
  "testing",
];

/** 观察行注记词形（cli baseline.ts OBSERVED_ANNOTATION 同源——断言分母单一）。 */
const OBSERVED_ANNOTATION = "[Observed: package.json]";

/** GP-5 派生 scope 建议词形（T2 Scope 派生的目标主体前缀）。 */
const DERIVED_SCOPE_PATTERN = /PAGE\.|CAPABILITY\.|COMPONENT\.|API_REQ\./;

// ============================================================
// 链记录（beforeAll 全链真跑捕获；it 层逐条消费）
// ============================================================

interface ChainRecords {
  readonly root: string;
  readonly init: StepRecord;
  /** init 时点的 frontend stack.yaml 原文快照（GP-1 判定分母——链后段 baselineSet 会改写现盘）。 */
  readonly initStackText: string;
  readonly start: StepRecord;
  readonly questionGateAsk: StepRecord;
  readonly questionGateDefer: StepRecord;
  readonly questionGateAssumption: StepRecord;
  readonly setGraph: StepRecord;
  readonly answer: StepRecord;
  readonly ready: StepRecord;
  readonly promote: StepRecord;
  /** promote 后 status（R_PERMIT_MISSING 时点；GP-5/GP-6①）。 */
  readonly routeAfterPromote: StepRecord;
  /** promote 后 alerts（中间态恢复面；GP-10）。 */
  readonly alertsAfterPromote: StepRecord;
  /** promote 时刻 claims 平面清单（GP-9 回溯分母；排除 README）。 */
  readonly claimsAtPromote: readonly string[];
  /** permit issue（按 R2 派生建议形态签发：--subject PAGE.DASHBOARD——派生建议可执行证明）。 */
  readonly permitIssue: StepRecord;
  /** permit issue 后 status（R_MANIFEST_MISSING 时点；GP-6②）。 */
  readonly routeAfterPermit: StepRecord;
  /** baseline 后补销账（css + BE 5 键——init 观察后剩余的规范性决策/BE 分母；GP-1 配套）。 */
  readonly baselineSet: StepRecord[];
  /** 销账后 status（R_BASELINE_NOT_READY 时点——T2 R5 新信号）。 */
  readonly routeBaselineReady: StepRecord;
  readonly baselineConfirm: StepRecord;
  /** confirm 后 status（R_MANIFEST_MISSING——确认还账后任务链继续）。 */
  readonly routeAfterBaselineConfirm: StepRecord;
  readonly manifestCompile: StepRecord;
  /** context compile 后 status（T2 R3：R_EXECUTE_ENTRY 时点 / GP-6③ / GP-7）。 */
  readonly routeAfterCompile: StepRecord;
  /** execution begin（R_EXECUTE_ENTRY 建议照做——④ EXECUTE 感知闭环）。 */
  readonly executionBegin: StepRecord;
  /** begin 后 status（R_VERIFY_ENTRY 时点——⑤ 执行中自检入口）。 */
  readonly routeAfterExecution: StepRecord;
  readonly gates: StepRecord;
  readonly claimRecord: StepRecord;
  /** record claim 分配的 CLM（GP-8 断言用；promote 自动生成 CLM-0001 后自适应编号）。 */
  readonly claimRef: string | null;
  /** record verification 挂的 GRN（evidence/runs 首个；GP-8 断言用）。 */
  readonly evidenceGrn: string | null;
  /** record verification 记录（claim/GRN 缺席时 = null 显式，链路坏损由 GREEN 金丝雀兜底）。 */
  readonly verification: StepRecord | null;
}

let chain: ChainRecords | null = null;

/** 信封 result → next_action 窄化（status --json）。 */
function nextActionOf(rec: StepRecord): Record<string, unknown> {
  const result = (envelopeOf(rec).result ?? {}) as Record<string, unknown>;
  return (result["next_action"] ?? {}) as Record<string, unknown>;
}

/** TASK 正文信封（truth/objects 逐文件扫描；缺席 throw = 链路坏损，RED 也该听见）。 */
function taskBody(root: string): Record<string, unknown> {
  const objectsDir = join(root, ".pomaster", "truth", "objects");
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, item.name);
      if (item.isDirectory()) walk(child);
      else found.push(child);
    }
  };
  walk(objectsDir);
  const hit = found.find((file) => readFileSync(file, "utf8").includes(TASK_ID));
  if (hit === undefined) throw new Error(`task body not found for ${TASK_ID}`);
  return JSON.parse(readFileSync(hit, "utf8")) as Record<string, unknown>;
}

/** TASK 正文 payload（02b body 信封的 payload 段）。 */
function taskPayload(root: string): Record<string, unknown> {
  const body = taskBody(root);
  return (body["payload"] ?? {}) as Record<string, unknown>;
}

/** claims/runs 平面清单（README 占位除外；目录缺席 = 显式空）。 */
function evidencePlaneFiles(root: string, plane: "claims" | "runs"): readonly string[] {
  const dir = join(root, ".pomaster", "evidence", plane);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^(GRN|CLM)-[0-9]+\.json$/.test(name))
    .sort();
}

/** 子进程跑生成器（fixture 字节稳定性自验用；主链 fixture 在 beforeAll 直跑目标根）。 */
function runGenerator(
  args: readonly string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [GENERATOR_SCRIPT, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise({ code: code ?? -1, stdout, stderr }));
  });
}

/** 目录全树 → 相对路径:字节串 列表（字节稳定性对比基线）。 */
function treeOf(dir: string): readonly string[] {
  const entries: string[] = [];
  const walk = (current: string, rel: string): void => {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, item.name);
      const childRel = rel === "" ? item.name : `${rel}/${item.name}`;
      if (item.isDirectory()) walk(child, childRel);
      else entries.push(`${childRel}:${readFileSync(child, "utf8")}`);
    }
  };
  walk(dir, "");
  return entries.sort();
}

// ============================================================
// 全链（真实项目形态 fixture + 八拍公开命令面真跑）
// ============================================================

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "pvnext-golden-path-"));
  const gen = await runGenerator([root]);
  if (gen.code !== 0) {
    throw new Error(`fixture 生成失败：${gen.stderr}`);
  }

  const init = await runJsonStep(root, ["init"]);
  // init 时点 stack.yaml 原文（GP-1 判定分母——观察注记必须在此刻在座）。
  const initStackText = readFileSync(
    join(root, ".pomaster", "baseline", "frontend", "stack.yaml"),
    "utf8",
  );
  const start = await runJsonStep(root, [
    "brainstorm",
    "start",
    "--id",
    DISCOVERY_ID,
    "--prompt",
    RAW_PROMPT,
  ]);

  // —— GP-2/GP-3 探针 scratchpad（question-gate 纯判卷零写面，独立 id 不扰主链）。 ——
  await runJsonStep(root, ["brainstorm", "start", "--id", "gp-qgate-ask"]);
  await runJsonStep(root, ["brainstorm", "start", "--id", "gp-qgate-defer"]);
  const questionGateAsk = await runJsonStep(root, [
    "brainstorm",
    "question-gate",
    "gp-qgate-ask",
    "--category",
    "PREFERENCE",
    "--q1", "false", "--q2", "false", "--q3", "false",
    "--q4", "false", "--q5", "false", "--q6", "false",
    "--q7", "true",
  ]);
  const questionGateDefer = await runJsonStep(root, [
    "brainstorm",
    "question-gate",
    "gp-qgate-defer",
    "--category",
    "DEFERABLE",
    "--q1", "false", "--q2", "false", "--q3", "false",
    "--q4", "false", "--q5", "false", "--q6", "false",
    "--q7", "false",
  ]);
  const questionGateAssumption = await runJsonStep(root, [
    "brainstorm",
    "question-gate",
    "gp-qgate-defer",
    "--category",
    "DEFERABLE",
    "--q1", "false", "--q2", "false", "--q3", "false",
    "--q4", "false", "--q5", "false", "--q6", "false",
    "--q7", "false",
    "--assume", "low_risk",
    "--assume", "reversible",
    "--assume", "within_permit",
    "--assume", "no_authority_conflict",
    "--assume", "acceptance_testable",
  ]);

  // —— brainstorm→promote 完整推进链（候选图 / 决议 / 收敛 / 提升）。 ——
  const candidatesPath = join(root, "gp-candidates.json");
  writeFileSync(
    candidatesPath,
    `${JSON.stringify(
      [
        {
          decision_id: "DECISION.GRID_STRATEGY",
          class: "SCOPE",
          prompt: "仪表盘页的数据表格采用 ag-grid 封装还是原生表格？",
          depends_on: [],
          affects: ["PAGE.DASHBOARD"],
          grounding: {
            intent_refs: ["DISCOVERY.INTENT.001"],
            truth_refs: ["baseline/frontend/stack.yaml"],
            contract_refs: [],
            architecture_refs: [],
            implementation_refs: [],
            evidence_refs: [],
            knowledge_refs: [],
            research_finding_refs: [],
            conflicts: [],
            missing_facts: [],
          },
          options: ["AG_GRID_WRAPPER", "NATIVE_TABLE"],
          recommendation: {
            option: "AG_GRID_WRAPPER",
            basis_refs: ["baseline/frontend/stack.yaml"],
            rationale: "fixture package.json 已声明 ag-grid-community，封装层收敛列定义与主题。",
            tradeoff: "封装层引入一层适配代码；原生表格零适配但列定义散落各页。",
            uncertainty: "ag-grid 大版本升级若破坏主题接口需重开本决策。",
            source: "PROJECT_GROUNDED",
          },
          authority: { owner: "BOOTSTRAP_OWNER" },
        },
      ],
      null,
      2,
    )}\n`,
    "utf8",
  );
  const setGraph = await runJsonStep(root, [
    "brainstorm", "decide", DISCOVERY_ID,
    "--set", candidatesPath,
    "--retrieved", "CURRENT_TRUTH",
    "--retrieved", "REPO",
  ]);
  const answer = await runJsonStep(root, [
    "brainstorm", "decide", DISCOVERY_ID,
    "--answer", "DECISION.GRID_STRATEGY", "--accept",
  ]);
  const ready = await runJsonStep(root, [
    "brainstorm", "decide", DISCOVERY_ID,
    "--ready",
    "--goal", "仪表盘数据表格封装策略收敛——先观察 fixture 技术栈再收敛表格方案",
    "--scope", "仪表盘页数据表格封装（PAGE.DASHBOARD）及列定义收敛",
    "--acceptance", "仪表盘数据表格封装经 ag-grid 封装后构建计数可独立重算@DECISION.GRID_STRATEGY",
  ]);
  const promote = await runJsonStep(root, [
    "brainstorm", "promote", DISCOVERY_ID,
    "--to", "TASK",
    "--basis", "msd_reached",
    "--apply",
  ]);

  // —— 中间态导航快照（GP-5/GP-6①/GP-10；先于 permit issue）。 ——
  const routeAfterPromote = await runJsonStep(root, ["status"]);
  const alertsAfterPromote = await runJsonStep(root, ["alerts"]);
  const claimsAtPromote = evidencePlaneFiles(root, "claims");

  // —— permit issue（按 T2 R2 派生建议的形态签发：--subject PAGE.DASHBOARD——
  //    affected_objects 派生建议直接可执行的证明）。 ——
  const permitIssue = await runJsonStep(root, [
    "permit", "issue",
    "--subject", "PAGE.DASHBOARD",
    "--actor", "agent:golden-path",
    "--change-ref", TASK_ID,
  ]);
  const routeAfterPermit = await runJsonStep(root, ["status"]);

  // —— baseline 收口（T2 R5）：init 观察掉 FE 8 键后剩余 6 unknowns（css 规范决策
  //    + BE 5 键）非交互销账 → status 呈 R_BASELINE_NOT_READY（新信号）→ confirm 还账。 ——
  const baselineSet: StepRecord[] = [];
  for (const [lane, key] of [
    ["frontend", "css"],
    ["backend", "language"],
    ["backend", "framework"],
    ["backend", "persistence"],
    ["backend", "database"],
    ["backend", "cache"],
  ] as const) {
    baselineSet.push(
      await runJsonStep(root, [
        "baseline", "set",
        "--lane", lane,
        "--key", key,
        "--value", key === "cache" ? "none" : `${lane}-${key}-value`,
      ]),
    );
  }
  const routeBaselineReady = await runJsonStep(root, ["status"]);
  const baselineConfirm = await runJsonStep(root, ["baseline", "confirm"]);
  const routeAfterBaselineConfirm = await runJsonStep(root, ["status"]);

  // —— context compile（任务级 manifest；GP-6③/GP-7）。 ——
  const manifestCompile = await runJsonStep(root, [
    "context", "compile",
    "--role", "frontend",
    "--change", TASK_ID,
  ]);
  const routeAfterCompile = await runJsonStep(root, ["status"]);

  // —— execution begin（T2 R3：④ EXECUTE 感知建议照做→⑤ VERIFY 入口）。 ——
  const executionBegin = await runJsonStep(root, [
    "execution", "begin",
    "--role", "implementer",
    "--runtime", "script",
    "--identity-kind", "script",
    "--task-id", TASK_ID,
  ]);
  const routeAfterExecution = await runJsonStep(root, ["status"]);

  // —— 证据链（GP-8）：check --gates GRN 入账 → record claim → record verification。 ——
  const gates = await runJsonStep(root, ["check", "--gates"]);
  const runFiles = evidencePlaneFiles(root, "runs");
  const evidenceGrn = runFiles[0]?.replace(/\.json$/, "") ?? null;
  const claimInputPath = join(root, "gp-claim-input.json");
  writeFileSync(
    claimInputPath,
    `${JSON.stringify(
      {
        subject_id: TASK_ID,
        assertion: "GP-8 验收断言：仪表盘构建计数经独立重算确认",
        asserted_by: { actor_type: "agent", actor: "golden-path-agent", self_attested: true },
        evidence_refs: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const claimRecord = await runJsonStep(root, ["record", "claim", "--from", claimInputPath]);
  const claimResult = (claimRecord.envelope?.result ?? {}) as Record<string, unknown>;
  const claimRef = typeof claimResult["clm"] === "string" ? claimResult["clm"] : null;
  const verification =
    claimRef !== null && evidenceGrn !== null
      ? await runJsonStep(root, [
          "record", "verification",
          "--clm", claimRef,
          "--verifier", "tool:golden-verifier@1.0.0",
          "--method", "recompute",
          "--evidence", evidenceGrn,
          "--authority-ref", TASK_ID,
        ])
      : null;

  chain = {
    root,
    init,
    initStackText,
    start,
    questionGateAsk,
    questionGateDefer,
    questionGateAssumption,
    setGraph,
    answer,
    ready,
    promote,
    routeAfterPromote,
    alertsAfterPromote,
    claimsAtPromote,
    permitIssue,
    routeAfterPermit,
    baselineSet,
    routeBaselineReady,
    baselineConfirm,
    routeAfterBaselineConfirm,
    manifestCompile,
    routeAfterCompile,
    executionBegin,
    routeAfterExecution,
    gates,
    claimRecord,
    claimRef,
    evidenceGrn,
    verification,
  };
}, 240_000);

afterAll(() => {
  if (chain !== null) {
    rmSync(chain.root, { recursive: true, force: true });
  }
});

/** 非空链窄化（it 内使用；beforeAll 未完成即显式红）。 */
function records(): ChainRecords {
  if (chain === null) throw new Error("golden-path 链未完成（beforeAll 未产出记录）");
  return chain;
}

// ============================================================
// fixture 生成器机制面（D-6：确定性可重复）
// ============================================================

describe("fixture 生成器（D-6 确定性测试床）", () => {
  it(
    "两次生成字节一致（零墙钟可重复）+ --check 自验通过",
    async () => {
      const dirA = mkdtempSync(join(tmpdir(), "pvnext-golden-fixture-a-"));
      const dirB = mkdtempSync(join(tmpdir(), "pvnext-golden-fixture-b-"));
      try {
        const runA = await runGenerator([dirA]);
        const runB = await runGenerator([dirB]);
        expect(runA.code, `生成 A 应成功：${runA.stderr}`).toBe(0);
        expect(runB.code, `生成 B 应成功：${runB.stderr}`).toBe(0);
        expect(treeOf(dirB), "两次生成应字节一致（A4 确定性）").toEqual(treeOf(dirA));
        const check = await runGenerator(["--check", dirA]);
        expect(check.code, `--check 自验应通过：${check.stderr}`).toBe(0);
      } finally {
        rmSync(dirA, { recursive: true, force: true });
        rmSync(dirB, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

// ============================================================
// GP-1 ～ GP-3（init 观察面 + question-gate 判卷面）
// ============================================================

describe("Golden Path 十条验收（GP-1~GP-3：init 观察与 question-gate）", () => {
  it(
    "GP-1 [T2已摘帽] init 观察项目技术事实：stack.yaml 可观察键为值 + [Observed: package.json] 标注而非 UNKNOWN；问卷分母同步收缩",
    () => {
      const records_ = records();
      // 链健康前置（当前绿）：init 成功、stack.yaml 播种在座。
      expect(records_.init.code, "init 应 exit 0").toBe(0);
      const initEnvelope = envelopeOf(records_.init);
      expect(initEnvelope.ok, "init 信封应 ok").toBe(true);
      const stackPath = join(records_.root, ".pomaster", "baseline", "frontend", "stack.yaml");
      expect(existsSync(stackPath), "baseline/frontend/stack.yaml 应在座").toBe(true);
      // 判定分母 = init 时点存档（链后段 baselineSet 会改写现盘——init 观察产物
      // 的判定必须锚在其发生时刻）。
      const text = records_.initStackText;
      // 核心断言（T2 init Bootstrap+Observation 转绿）：fixture package.json 已声明
      // vue/vue-router/pinia/element-plus/ag-grid-community/vitest/vite/typescript，
      // init 应机器自读这些可观察事实（值 + [Observed: package.json] 来源标注），
      // 只把规范性决策（如 css 方案）留给问人。
      for (const key of OBSERVABLE_STACK_KEYS) {
        const line = text
          .split("\n")
          .find((row) => row.startsWith(`${key}:`));
        expect(line, `stack.yaml 应有 ${key} 键行`).toBeDefined();
        const lineText = line as string;
        expect(
          lineText,
          `${key} 应为观察值而非 UNKNOWN 起步词形（行：${lineText}）`,
        ).not.toMatch(new RegExp(`^${key}:\\s*UNKNOWN\\b`));
        expect(lineText, `${key} 观察行应携带来源标注（行：${lineText}）`).toContain(
          OBSERVED_ANNOTATION,
        );
      }
      expect(text, "观察事实应携带 [Observed: package.json] 来源标注").toContain(
        OBSERVED_ANNOTATION,
      );
      // 摘帽新信号（防退化为空转绿）：init 信封 observation 结构化面 + 问卷分母收缩。
      const initResult = (initEnvelope.result ?? {}) as Record<string, unknown>;
      const observation = initResult["observation"] as Record<string, unknown> | null;
      expect(observation, "init 结果应携带 observation 字段（T2 R4）").not.toBeNull();
      expect(observation?.["source"]).toBe("package.json");
      expect(observation?.["observed"]).toBe(OBSERVABLE_STACK_KEYS.length);
      expect(observation?.["skipped_resolved"]).toBe(0);
      // css（规范性决策）不被观察代答——保持 UNKNOWN 起步词形。
      const cssLine = text.split("\n").find((row) => row.startsWith("css:"));
      expect(cssLine, "stack.yaml 应有 css 键行").toBeDefined();
      expect(cssLine).toMatch(/^css:\s*UNKNOWN\b/);
    },
  );

  it("GP-2 [GREEN-机制] brainstorm question-gate 机制可判卷：七关申报产出词表内 verdict", () => {
    const records_ = records();
    expect(records_.questionGateAsk.code).toBe(0);
    const envelope = envelopeOf(records_.questionGateAsk);
    expect(envelope.command).toBe("brainstorm question-gate");
    expect(envelope.ok).toBe(true);
    const result = (envelope.result ?? {}) as Record<string, unknown>;
    expect(
      QUESTION_VERDICTS,
      `verdict 应在处置词形六值闭包内（实得 ${String(result["verdict"])}）`,
    ).toContain(result["verdict"]);
    // 七关全不过 + 真阻塞 + 申报 PREFERENCE（可问类）→ ASK_HUMAN：机制判卷成立。
    expect(result["verdict"]).toBe("ASK_HUMAN");
    expect(result["may_ask_human"]).toBe(true);
  });

  it("GP-3 [GREEN-机制] 机器面禁偷渡假设：无五条件申报 verdict ≠ ASSUMPTION；五条件全申报才 ASSUMPTION", () => {
    const records_ = records();
    // 反向（禁偷渡）：七关无上游可答 + 不阻塞，但零五条件申报 → DEFERABLE 而非 ASSUMPTION。
    expect(records_.questionGateDefer.code).toBe(0);
    const defer = (envelopeOf(records_.questionGateDefer).result ?? {}) as Record<string, unknown>;
    expect(QUESTION_VERDICTS).toContain(defer["verdict"]);
    expect(defer["verdict"], "未申报五条件不得产出 ASSUMPTION 处置").not.toBe("ASSUMPTION");
    expect(defer["verdict"]).toBe("DEFERABLE");
    // 正向（显式申报在册）：同一问题五条件全显式申报 → ASSUMPTION（DEFERABLE 的显式升级）。
    expect(records_.questionGateAssumption.code).toBe(0);
    const assumption = (envelopeOf(records_.questionGateAssumption).result ?? {}) as Record<string, unknown>;
    expect(assumption["verdict"], "五条件全申报应产出 ASSUMPTION 处置").toBe("ASSUMPTION");
  });
});

// ============================================================
// GP-4 ～ GP-10（brainstorm→promote→permit→context→verify 全链行为）
// ============================================================

describe("Golden Path 十条验收（GP-4~GP-10：Intent Chain 全链）", () => {
  it(
    "GP-4 [T2已摘帽] promote 保留真实 Intent/Expected：intent 含 goal 文本（非泛化文案）、acceptance 非空且每条 {criterion, claim} 挂锚；titleZh/notesMd/affected_objects 全投影",
    () => {
      const records_ = records();
      // 链健康前置（当前绿）：promote --apply 落库成功、TASK 对象在册。
      expect(records_.promote.code, "promote --apply 应 exit 0").toBe(0);
      const promoteResult = (envelopeOf(records_.promote).result ?? {}) as Record<string, unknown>;
      expect(promoteResult["applied"], "promote 应已落库").toBe(true);
      expect(promoteResult["promoted_ref"]).toBe(TASK_ID);
      const body = taskBody(records_.root);
      const payload = taskPayload(records_.root);
      // 核心断言一（T2 Task Contract Compiler 转绿）：intent ← goal（含 raw prompt 追溯锚），
      // 不是「Discovery 提升：<id>」泛化投影文案。
      const intent = payload["intent"];
      expect(typeof intent).toBe("string");
      const intentText = intent as string;
      expect(
        intentText.startsWith("Discovery 提升："),
        `intent 不得是泛化投影文案（实得：${intentText}）`,
      ).toBe(false);
      expect(intentText, "intent 应可回溯 goal 文本（raw prompt 已在 brainstorm start 登记）").toContain(
        GOAL_PHRASE,
      );
      // 核心断言二（D-7 投影表）：acceptance 非空且每条 {criterion, claim} 挂 DECISION.*/ASSUMPTION 锚。
      const acceptance = payload["acceptance"];
      expect(Array.isArray(acceptance), "acceptance 应为数组且非空").toBe(true);
      const entries = (acceptance as readonly unknown[]) ?? [];
      expect(entries.length, "promote 编译出的 acceptance 不得为空").toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry, "acceptance 条目应为对象").toBeTypeOf("object");
        const row = entry as Record<string, unknown>;
        expect(typeof row["criterion"], "criterion 应为非空字符串").toBe("string");
        expect(String(row["criterion"]).length).toBeGreaterThan(0);
        expect(String(row["claim"]), "claim 应为 CLM-n 词形").toMatch(/^CLM-[0-9]+$/);
        expect(
          JSON.stringify(row),
          "每条 acceptance 应挂 DECISION.*/ASSUMPTION 锚（D-7 机器校验锚）",
        ).toMatch(/DECISION\.|ASSUMPTION/);
      }
      // 摘帽新信号（防退化为空转绿）：D-7 投影表其余三投影逐项在座。
      expect(
        intentText,
        "intent 应携带 raw prompt 溯源锚（scratchpad meta.json → prompt）",
      ).toContain(".pomaster/discovery/scratchpads/golden-path-demo/");
      expect(
        body["title_zh"],
        "titleZh 应 ← discovery title（start 未给 --title = id 词形），不再是泛化前缀文案",
      ).toBe(DISCOVERY_ID);
      expect(
        body["notes_md"],
        "notesMd 应 ← scope 文本 + 四桶残留摘要（Task Contract scope 投影）",
      ).toContain("仪表盘页数据表格封装（PAGE.DASHBOARD）及列定义收敛");
      const affectedObjects = payload["affected_objects"];
      expect(
        Array.isArray(affectedObjects) && (affectedObjects as readonly unknown[]).includes("PAGE.DASHBOARD"),
        "affected_objects 应 ← 已决议 Decision affects 并集（含 PAGE.DASHBOARD）",
      ).toBe(true);
    },
  );

  it(
    "GP-5 [T2已摘帽] R_PERMIT_MISSING 建议派生 scope：command 含 PAGE. 派生主体 + 派生建议直接可执行（链内照做签发成功）",
    () => {
      const records_ = records();
      expect(records_.routeAfterPromote.code).toBe(0);
      const nextAction = nextActionOf(records_.routeAfterPromote);
      // 前置（当前绿）：活跃任务无绑定许可 → R_PERMIT_MISSING。
      expect(nextAction["route_id"]).toBe("R_PERMIT_MISSING");
      const command = nextAction["command"];
      expect(typeof command).toBe("string");
      // 核心断言（T2 Scope 派生转绿）：建议命令携带从 Task/affected_objects 派生的
      // scope 主体（DECISION.GRID_STRATEGY affects → PAGE.DASHBOARD），而非仅 TASK 自身。
      expect(
        command,
        `permit issue 建议应含派生 scope 主体（实得：${String(command)}）`,
      ).toMatch(DERIVED_SCOPE_PATTERN);
      // 摘帽新信号（防退化为空转绿）：建议命令精确词形（派生 subject 逐字 + --change-ref
      // 绑定任务），且链内照做（--subject PAGE.DASHBOARD）签发成功——派生建议可执行。
      expect(command).toBe(
        "pomaster permit issue --subject PAGE.DASHBOARD --actor <type>:<name> --change-ref TASK.GOLDEN_PATH_DEMO",
      );
      expect(records_.permitIssue.code, "按派生建议签发应 exit 0").toBe(0);
      const permitResult = (envelopeOf(records_.permitIssue).result ?? {}) as Record<string, unknown>;
      expect(permitResult["change_ref"]).toBe(TASK_ID);
    },
  );

  it("GP-6 [GREEN-机制] Permit 与 Context 自动建立：R_PERMIT_MISSING → permit issue → R_MANIFEST_MISSING → context compile 逐拍不断档", () => {
    const records_ = records();
    // 拍①：活跃任务无许可 → R_PERMIT_MISSING。
    expect(nextActionOf(records_.routeAfterPromote)["route_id"]).toBe("R_PERMIT_MISSING");
    // 拍②：按链签发（R2 派生建议 --subject PAGE.DASHBOARD + change-ref=TASK）→ 路由前进。
    expect(records_.permitIssue.code).toBe(0);
    expect(envelopeOf(records_.permitIssue).ok).toBe(true);
    expect(nextActionOf(records_.routeAfterPermit)["route_id"]).toBe("R_MANIFEST_MISSING");
    const missingCommand = nextActionOf(records_.routeAfterPermit)["command"];
    expect(
      typeof missingCommand === "string" && missingCommand.includes("context compile"),
      `R_MANIFEST_MISSING 建议应是 context compile（实得：${String(missingCommand)}）`,
    ).toBe(true);
    expect(
      typeof missingCommand === "string" && missingCommand.includes(TASK_ID),
      "建议命令应携带任务 ref（许可通道激活面）",
    ).toBe(true);
    // 拍③：context compile 落 manifest → 路由不再停留 R_MANIFEST_MISSING（链无断档）。
    expect(records_.manifestCompile.code).toBe(0);
    expect(envelopeOf(records_.manifestCompile).ok).toBe(true);
    expect(nextActionOf(records_.routeAfterCompile)["route_id"]).not.toBe("R_MANIFEST_MISSING");
  });

  it("R5 [T2新增信号] baseline 收口路由：unknowns 全销账未确认 → R_BASELINE_NOT_READY（baseline confirm）→ 确认后还账回落任务链", () => {
    const records_ = records();
    // 前置：init 观察后剩余 6 unknowns 非交互销账全过（GP-1 的观察面把问人分母压到 6）。
    expect(records_.baselineSet).toHaveLength(6);
    expect(records_.baselineSet.every((step) => step.code === 0)).toBe(true);
    // 核心断言（T2 R5 转绿）：unknowns 0 + 未确认 → R_BASELINE_NOT_READY（beat 0，
    // 命令 = 裸 confirm）——收口前账的确定性路标。
    expect(records_.routeBaselineReady.code).toBe(0);
    expect(nextActionOf(records_.routeBaselineReady)["route_id"]).toBe("R_BASELINE_NOT_READY");
    expect(nextActionOf(records_.routeBaselineReady)["beat"]).toBe("0");
    expect(nextActionOf(records_.routeBaselineReady)["command"]).toBe("pomaster baseline confirm");
    // 照做 confirm（digest 快照落盘）→ gate 转绿 → 回落任务链（R_MANIFEST_MISSING——
    // confirm 还账不扰动 permit/manifest 既有进度）。
    expect(records_.baselineConfirm.code).toBe(0);
    expect(nextActionOf(records_.routeAfterBaselineConfirm)["route_id"]).toBe("R_MANIFEST_MISSING");
  });

  it(
    "GP-7 [T2已摘帽] manifest fresh 与 Verify 之间存在执行感知过渡：compile 后 R_EXECUTE_ENTRY → execution begin → R_VERIFY_ENTRY",
    () => {
      const records_ = records();
      expect(records_.routeAfterCompile.code).toBe(0);
      const nextAction = nextActionOf(records_.routeAfterCompile);
      // 前置（当前绿）：manifest 在座且新鲜（compile 后无漂移）。
      expect(
        existsSync(join(records_.root, ".pomaster", "state", "contexts", `${TASK_ID}.context.json`)),
        "任务级 manifest 应在座",
      ).toBe(true);
      expect(typeof nextAction["route_id"]).toBe("string");
      // 核心断言（T2 ④ Execute 感知转绿）：Context Ready 与 Verify 之间存在确定性
      // 执行感知过渡路由 R_EXECUTE_ENTRY（runs 留痕分母空 + 无在途执行档案），而不是
      // 直跳 R_VERIFY_ENTRY（check --fast）。
      expect(
        nextAction["route_id"],
        `执行感知路由缺席——manifest fresh 且无执行留痕不应直跳 Verify（实得：${String(nextAction["route_id"])}）`,
      ).toBe("R_EXECUTE_ENTRY");
      expect(
        nextAction["beat"],
        "④ EXECUTE 拍位词形应在座",
      ).toBe("④");
      expect(
        String(nextAction["command"]),
        "R_EXECUTE_ENTRY 建议应是 execution begin（携 --task-id）",
      ).toBe(
        `pomaster execution begin --role <role> --runtime <runtime> --identity-kind <kind> --task-id ${TASK_ID}`,
      );
      // 摘帽新信号（防退化为空转绿）：照做 execution begin → 在途档案在座 → 路由
      // 前进到 R_VERIFY_ENTRY（执行感知 ④→⑤ 分叉在真实链上闭合）。
      expect(records_.executionBegin.code, "execution begin 应 exit 0").toBe(0);
      const beginResult = (envelopeOf(records_.executionBegin).result ?? {}) as Record<string, unknown>;
      expect(String(beginResult["execution_id"])).toMatch(/^AGX-[0-9]{4}-[0-9]+$/);
      expect(nextActionOf(records_.routeAfterExecution)["route_id"]).toBe("R_VERIFY_ENTRY");
      expect(nextActionOf(records_.routeAfterExecution)["command"]).toContain("pomaster check --fast");
    },
  );

  it("GP-8 [GREEN-机制] Verification 证据链机制在：check --gates GRN 入账 + record claim/verification 后 claim VERIFIED", () => {
    const records_ = records();
    // GRN 入账：check --gates 判卷行携带 grn 且落盘 evidence/runs/（fail-closed 非绿
    // 是 fixture 无安装环境的诚实缺席——入账机制本身成立）。
    expect(records_.gates.code).toBeGreaterThan(0);
    const gatesResult = (envelopeOf(records_.gates).result ?? {}) as Record<string, unknown>;
    const rows = (gatesResult["rows"] ?? []) as Record<string, unknown>[];
    expect(rows.length, "check --gates 应产出判卷行").toBeGreaterThan(0);
    expect(rows.every((row) => typeof row["grn"] === "string" && /^GRN-[0-9]+$/.test(String(row["grn"])))).toBe(true);
    const runFiles = evidencePlaneFiles(records_.root, "runs");
    expect(runFiles.length, "GRN 应入账 evidence/runs/").toBeGreaterThanOrEqual(rows.length);
    // claim → 独立验证判定回写：record claim（UNVERIFIED 先立后证）→ record verification（VERIFIED）。
    expect(records_.claimRecord.code).toBe(0);
    const claimResult = (envelopeOf(records_.claimRecord).result ?? {}) as Record<string, unknown>;
    expect(claimResult["change"]).toBe("APPLIED");
    const claimRef = records_.claimRef;
    expect(claimRef, "record claim 应分配 CLM").toMatch(/^CLM-[0-9]+$/);
    expect(records_.verification).not.toBeNull();
    const verification = records_.verification as StepRecord;
    expect(verification.code).toBe(0);
    const verificationResult = (envelopeOf(verification).result ?? {}) as Record<string, unknown>;
    expect(verificationResult["change"]).toBe("APPLIED");
    expect(verificationResult["verification"]).toBe("VERIFIED");
    const claimOnDisk = JSON.parse(
      readFileSync(join(records_.root, ".pomaster", "evidence", "claims", `${claimRef}.json`), "utf8"),
    ) as Record<string, unknown>;
    const verificationBlock = (claimOnDisk["verification"] ?? {}) as Record<string, unknown>;
    expect(verificationBlock["verdict"]).toBe("VERIFIED");
    const evidenceRefs = JSON.stringify(claimOnDisk["evidence_refs"] ?? []);
    expect(evidenceRefs).toContain(String(records_.evidenceGrn));
  });

  it(
    "GP-9 [T2已摘帽] closeout 判卷可回溯 promote 时刻 Expected：acceptance 的 claim 与 promote 自动生成的 CLM 对得上",
    () => {
      const records_ = records();
      expect(records_.promote.code).toBe(0);
      // 摘帽新信号（防退化为空转绿）：promote 结果声明自动 claim 条数（D-7 收尾闭环）。
      const promoteResult = (envelopeOf(records_.promote).result ?? {}) as Record<string, unknown>;
      const claimsGenerated = promoteResult["claims_generated"];
      expect(
        typeof claimsGenerated === "number" && claimsGenerated > 0,
        `promote 结果应携带 claims_generated > 0（实得：${String(claimsGenerated)}）`,
      ).toBe(true);
      const payload = taskPayload(records_.root);
      const acceptance = payload["acceptance"];
      expect(Array.isArray(acceptance), "acceptance 应为数组且非空（D-7 收尾闭环）").toBe(true);
      const entries = (acceptance as readonly unknown[]) ?? [];
      expect(entries.length).toBe(claimsGenerated);
      // 核心断言（T2 转绿：promote 自动 record claim 生成 CLM 绑定 acceptance）：
      // 每条 acceptance.claim 在 promote 时刻已自动生成（claimsAtPromote 快照分母），
      // closeout 判卷对的是最初 Expected State 而非 Task id。
      for (const entry of entries) {
        const row = entry as Record<string, unknown>;
        const claim = String(row["claim"]);
        expect(
          records_.claimsAtPromote,
          `${claim} 应在 promote 时刻自动生成（快照分母：${records_.claimsAtPromote.join("、") || "空"}）`,
        ).toContain(`${claim}.json`);
      }
    },
  );

  it("GP-10 [GREEN-机制] 中间态恢复面：新 session alerts --json workflow_routing 非空且带下一拍命令", () => {
    const records_ = records();
    expect(records_.alertsAfterPromote.code).toBe(0);
    const result = (envelopeOf(records_.alertsAfterPromote).result ?? {}) as Record<string, unknown>;
    expect(result["initialized"]).toBe(true);
    const routing = result["workflow_routing"] as readonly string[];
    expect(Array.isArray(routing), "workflow_routing 应为数组").toBe(true);
    expect(routing.length, "中间态（活跃任务无许可）路由段应非空").toBeGreaterThan(0);
    const joined = routing.join("\n");
    expect(joined).toContain("下一拍:");
    expect(joined).toContain("pomaster");
    expect(joined).toContain(TASK_ID);
    expect(result["next_action"], "next_action 机读面应同源在场").not.toBeNull();
  });
});
