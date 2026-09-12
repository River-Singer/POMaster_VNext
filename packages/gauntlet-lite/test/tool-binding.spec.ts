/**
 * tool-binding.spec.ts —— ToolBinding 统一注册面（W1-R1-4 切片；09-10 PRD §17
 * ToolBinding 目标产品合同 + integration-designs.md 设计一 Vitest 闭环）。
 *
 * 判据锚：
 * - 受信 adapter 注册表（TRUSTED_BINDING_ADAPTERS）是绑定 adapter_ref 的唯一解析面
 *   ——「注册究竟是四件事」之 Adapter 注册（test-tool-integration.md §注册）：
 *   绑定只允许引用发行包受信 adapter；catalog/tools/ 文件名枚举与任意脚本热加载
 *   均不是注册面（红线：禁止任意脚本热加载进 kernel / 判卷核心）。
 * - validated 判定式 = adapter 能力声明与 binding report_contract 匹配（本切片
 *   裁定口径；parser 能力测试 = 本 spec 即能力测试登记——设计一 §4.2「列出必要
 *   消费者」+ test-tool-integration §矩阵「自定义 parser 必须登记版本与能力测试」）。
 * - runBindingGate = 绑定式执行的唯一通路：沿 §59 adapter 管线（prepare→run→
 *   normalize），binding 只供执行面参数（command/cwd/timeout/env_allowlist）——
 *   不另起执行器、不改判卷语义；工具发现≠调用授权（executed 态必须有真实执行
 *   回执——GRN 入账归 record gate-run 现有显式入口，本函数不落账）。
 * - scope.note 绑定留痕（binding_id=<id>）= SP-W1-f 过渡形态（03 schema
 *   binding_ref 位待 Owner 追认）；词形/字段面/闭包全部 = SP 提案待追认。
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BINDING_ANNOTATION_PREFIX,
  GateAdapterError,
  TRUSTED_BINDING_ADAPTERS,
  allowlistSpawn,
  bindingAdapterContractMatches,
  resolveTrustedBindingAdapter,
  runBindingGate,
  type ToolBindingRecord,
} from "@pomaster/gauntlet-lite";

const cleanupRoots: string[] = [];

afterEach(() => {
  while (cleanupRoots.length > 0) {
    const root = cleanupRoots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

/** 带 vitest 声明的 fixture 仓（adapter.prepare 需 detectVitest READY——真实探测路径）。 */
function makeVitestRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "pomaster-tb-"));
  cleanupRoots.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "tb-fixture", devDependencies: { vitest: "^2.1.8" } }),
    "utf8",
  );
  return root;
}

/** 设计一 §4.2 注册映射链的标准 vitest 绑定（字段值逐字对齐 integration-designs.md §1.2）。 */
function vitestBinding(overrides?: Partial<ToolBindingRecord>): ToolBindingRecord {
  return {
    id: "project.test.vitest-build",
    source: "built_in",
    transport: "cli",
    adapter_ref: "builtin.gauntlet-lite.build",
    tool: "gauntlet:vitest",
    tool_version_anchor: "2.1.8",
    gate: "BUILD",
    gate_def: "POLICY.GATE.BUILD@0.1.0",
    metric_dialect: "test:assertion_count",
    capabilities: ["unit_behavior"],
    execution: {
      command: "corepack pnpm exec vitest run --reporter=json",
      cwd: ".",
    },
    report_contract: {
      format: "vitest-json-stdout",
      parser_ref: "builtin.gauntlet-lite.build/vitest-json",
      parser_version: "0.1.0",
    },
    evidence_targets: [],
    environment: { requires: false },
    ...overrides,
  } as ToolBindingRecord;
}

/** 最小 vitest JSON 报告（2 执行断言全绿；build adapter normalize 判卷输入词形）。 */
const GREEN_VITEST_JSON = JSON.stringify({
  numTotalTests: 2,
  numFailedTests: 0,
  testResults: [
    {
      name: "a.spec.ts",
      assertionResults: [
        { title: "a", status: "passed" },
        { title: "b", status: "passed" },
      ],
    },
  ],
});

function fakeSpawn(stdout: string, status: number | null = 0, error: string | null = null) {
  const calls: { command: string; cwd: string; timeoutMs: number }[] = [];
  const spawnFn = (command: string, options: { cwd: string; timeoutMs: number }) => {
    calls.push({ command, cwd: options.cwd, timeoutMs: options.timeoutMs });
    return { status, stdout, stderr: "", error, externalMs: 5 };
  };
  return { spawnFn, calls };
}

describe("TRUSTED_BINDING_ADAPTERS（受信 adapter 注册表——绑定 adapter_ref 唯一解析面）", () => {
  it("builtin.gauntlet-lite.build 在册：能力声明/报告合同闭包/工具 id 闭包齐备（validated 判定式的对照面）", () => {
    const decl = resolveTrustedBindingAdapter("builtin.gauntlet-lite.build");
    expect(decl).not.toBeNull();
    expect(decl?.adapterKey).toBe("build");
    expect(decl?.capabilities).toContain("unit_behavior");
    expect(decl?.accepted_formats).toContain("vitest-json-stdout");
    expect(decl?.accepted_parser_refs).toContain("builtin.gauntlet-lite.build/vitest-json");
    expect(decl?.accepted_metric_dialects).toContain("test:assertion_count");
    expect(decl?.accepted_tool_ids).toContain("gauntlet:vitest");
    expect(TRUSTED_BINDING_ADAPTERS["builtin.gauntlet-lite.build"]).toBeDefined();
  });

  it("未知 adapter_ref → null（绑定不得引用未接线 adapter——探测/登记不能自行扩大 permit）", () => {
    expect(resolveTrustedBindingAdapter("builtin.gauntlet-lite.playwright")).toBeNull();
    expect(resolveTrustedBindingAdapter("project.custom.script")).toBeNull();
  });
});

describe("bindingAdapterContractMatches（validated 判定式核心——纯函数零 I/O）", () => {
  it("标准 vitest 绑定 → ok（能力/格式/parser_ref/口径/工具 id 五匹配）", () => {
    const result = bindingAdapterContractMatches(vitestBinding());
    expect(result.ok).toBe(true);
  });

  it("report_contract.format 越闭包 → 不匹配且 reason 点名 format", () => {
    const result = bindingAdapterContractMatches(
      vitestBinding({
        report_contract: {
          format: "junit-xml",
          parser_ref: "builtin.gauntlet-lite.build/vitest-json",
          parser_version: "0.1.0",
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join("；")).toContain("format");
  });

  it("parser_ref 越受信闭包 → 不匹配（自定义 parser 须登记版本与能力测试——矩阵纪律）", () => {
    const result = bindingAdapterContractMatches(
      vitestBinding({
        report_contract: {
          format: "vitest-json-stdout",
          parser_ref: "project.local.parser",
          parser_version: "0.1.0",
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join("；")).toContain("parser_ref");
  });

  it("metric_dialect 越闭包（口径漂移防线）与 capabilities 越声明（能力冒领防线）均不匹配", () => {
    const dialect = bindingAdapterContractMatches(
      vitestBinding({ metric_dialect: "coverage:lines" }),
    );
    expect(dialect.ok).toBe(false);
    if (!dialect.ok) expect(dialect.reasons.join("；")).toContain("metric_dialect");

    const capability = bindingAdapterContractMatches(
      vitestBinding({ capabilities: ["load_test"] }),
    );
    expect(capability.ok).toBe(false);
    if (!capability.ok) expect(capability.reasons.join("；")).toContain("capabilities");
  });

  it("binding.tool 越受信工具 id 闭包 → 不匹配（绑定工具身份必须与 adapter 实际执行者对账）", () => {
    const result = bindingAdapterContractMatches(vitestBinding({ tool: "gauntlet:tsc" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join("；")).toContain("tool");
  });
});

describe("runBindingGate（绑定式执行——沿 §59 adapter 管线，binding 只供执行面参数）", () => {
  it("happy path：真实管线归一 passed + binding 执行面覆盖 plan.command/cwd + 锚透传 + scope.note 绑定留痕", () => {
    const repo = makeVitestRepo();
    const { spawnFn, calls } = fakeSpawn(GREEN_VITEST_JSON);
    const outcome = runBindingGate(
      vitestBinding({
        execution: { command: "node report.mjs --reporter=json", cwd: "sub" },
      }),
      { projectRoot: repo, grn: "GRN-0001", ranAtSeq: 7 },
      { spawnFn },
    );
    expect(outcome.binding_id).toBe("project.test.vitest-build");
    expect(outcome.record.verdict).toBe("passed");
    expect(outcome.record.counts).toMatchObject({ scanned: 2, violations: 0, applicableScanned: 2 });
    expect(outcome.record.tool).toBe("gauntlet:vitest");
    expect(outcome.record.gate).toBe("BUILD");
    // binding 执行面进 plan（不另起执行器——adapter 管线消费 binding 参数）：
    expect(outcome.plan.command).toBe("node report.mjs --reporter=json");
    expect(outcome.plan.expectedToolVersion).toBe("2.1.8");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("node report.mjs --reporter=json");
    expect(calls[0]?.cwd).toBe(join(repo, "sub"));
    // SP-W1-f 过渡留痕：scope.note 绑定词形（binding_ref schema 位待 Owner 追认）。
    expect(outcome.record.scopeNote ?? "").toContain(
      `${BINDING_ANNOTATION_PREFIX}project.test.vitest-build`,
    );
  });

  it("timeout_ms 缺省链：binding 声明优先进 policy/plan，缺席回落 adapter 缺省（600000）", () => {
    const repo = makeVitestRepo();
    const declared = runBindingGate(
      vitestBinding({ execution: { command: "node x.mjs", cwd: ".", timeout_ms: 1234 } }),
      { projectRoot: repo, grn: "GRN-0001", ranAtSeq: 1 },
      { spawnFn: fakeSpawn(GREEN_VITEST_JSON).spawnFn },
    );
    expect(declared.plan.timeoutMs).toBe(1234);
    const fallback = runBindingGate(
      vitestBinding(),
      { projectRoot: repo, grn: "GRN-0001", ranAtSeq: 1 },
      { spawnFn: fakeSpawn(GREEN_VITEST_JSON).spawnFn },
    );
    expect(fallback.plan.timeoutMs).toBe(600_000);
  });

  it("TEST.* subject（Q3）：isFixture 双向耦合贯通（fixture 绑定探针合法路径）", () => {
    const repo = makeVitestRepo();
    const outcome = runBindingGate(
      vitestBinding(),
      { projectRoot: repo, grn: "GRN-0002", ranAtSeq: 2, subjectId: "TEST.CSV.QUOTED_CELL" },
      { spawnFn: fakeSpawn(GREEN_VITEST_JSON).spawnFn },
    );
    expect(outcome.record.isFixture).toBe(true);
  });

  it("子进程不可执行 → not_run 显式缺席（非绿非红——裸 exit code 不参与判卷的管线纪律保持）", () => {
    const repo = makeVitestRepo();
    const outcome = runBindingGate(
      vitestBinding(),
      { projectRoot: repo, grn: "GRN-0003", ranAtSeq: 3 },
      { spawnFn: fakeSpawn("", null, "spawn failed").spawnFn },
    );
    expect(outcome.record.verdict).toBe("not_run");
    expect(outcome.record.scopeNote ?? "").toContain("binding_id=project.test.vitest-build");
  });

  it("fail-closed：未知 adapter_ref / validated 未达 / 可执行体探针缺席 → GateAdapterError（编排层转 not_run）", () => {
    const repo = makeVitestRepo();
    const run = (binding: ToolBindingRecord, deps?: Parameters<typeof runBindingGate>[2]) =>
      () => runBindingGate(binding, { projectRoot: repo, grn: "GRN-0004", ranAtSeq: 4 }, deps);

    expect(
      run(vitestBinding({ adapter_ref: "project.custom.script" }) as ToolBindingRecord),
    ).toThrow(GateAdapterError);
    expect(
      run(
        vitestBinding({
          report_contract: {
            format: "unknown-format",
            parser_ref: "builtin.gauntlet-lite.build/vitest-json",
            parser_version: "0.1.0",
          },
        }),
      ),
    ).toThrow(GateAdapterError);
    expect(run(vitestBinding(), { executableProbe: () => null })).toThrow(GateAdapterError);
  });
});

describe("allowlistSpawn（SP-W1-h 环境白名单执行面——只在绑定通路生效，既有腿零行为变更）", () => {
  const WIN_MIN = ["SystemRoot", "ComSpec", "SystemDrive", "windir", "TEMP", "TMP"];
  it("白名单内变量透传给子进程，白名单外变量被滤除（真实子进程验证）", () => {
    process.env["POMASTER_TB_PROBE"] = "inside";
    try {
      const script =
        "process.stdout.write(String(process.env.POMASTER_TB_PROBE === undefined ? 'filtered' : process.env.POMASTER_TB_PROBE))";
      const allowed = allowlistSpawn(["PATH", "Path", "POMASTER_TB_PROBE", ...WIN_MIN])(
        `node -e "${script}"`,
        { cwd: process.cwd(), timeoutMs: 30_000 },
      );
      expect(allowed.status).toBe(0);
      expect(allowed.stdout.trim()).toBe("inside");

      const filtered = allowlistSpawn(["PATH", "Path", ...WIN_MIN])(
        `node -e "${script}"`,
        { cwd: process.cwd(), timeoutMs: 30_000 },
      );
      expect(filtered.status).toBe(0);
      expect(filtered.stdout.trim()).toBe("filtered");
    } finally {
      delete process.env["POMASTER_TB_PROBE"];
    }
  });

  it("runBindingGate 携带 env_allowlist 时子进程环境被收敛（绑定级白名单真实生效——泄漏即不可判卷）", () => {
    const repo = makeVitestRepo();
    process.env["POMASTER_TB_PROBE"] = "leaked";
    try {
      // 环境干净时输出合法 vitest JSON（判 passed）；探针变量泄漏时输出垃圾（判 not_run）
      // ——verdict=passed 即证明绑定级白名单真实滤掉了白名单外变量。
      // 注意：脚本源码只用单引号字符串、JSON 双引号由 JSON.stringify 运行期生成
      // （字面双引号会打断 cmd.exe 的 -e "..." 参数解析）。
      const script =
        "process.stdout.write(process.env.POMASTER_TB_PROBE === undefined ? " +
        "JSON.stringify({numTotalTests:2,numFailedTests:0,testResults:" +
        "[{name:'a.spec.ts',assertionResults:[{title:'a',status:'passed'},{title:'b',status:'passed'}]}]}) " +
        ": 'ENV_LEAKED')";
      const outcome = runBindingGate(
        vitestBinding({
          execution: {
            command: `node -e "${script}"`,
            cwd: ".",
            env_allowlist: ["PATH", "Path", ...WIN_MIN],
          },
        }),
        { projectRoot: repo, grn: "GRN-0005", ranAtSeq: 5 },
        {},
      );
      expect(outcome.record.verdict).toBe("passed");
      expect(outcome.record.counts).toMatchObject({ scanned: 2, violations: 0 });
    } finally {
      delete process.env["POMASTER_TB_PROBE"];
    }
  });
});
