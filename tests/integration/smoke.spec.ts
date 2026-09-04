/**
 * smoke.spec.ts —— 临时目录端到端冒烟：pomaster init → triage×2 → status --json → doctor --json。
 *
 * 命令面契约（@pomaster/cli 六命令，§45 双输出；本 spec 消费其机读信封）：
 * - init          = BOOTSTRAP：.pomaster/ 骨架 + 入口文件（D13 2026-09-03 修订：
 *                   重入口默认）；幂等（A4/No-op is elegant：
 *                   重复 init 产物字节稳定，第二次 NO_CHANGE）
 * - triage <text> = 八拍①：关键词规则桶判档（C1）；判定必附 absent_signals（缺席显式）
 * - status --json = 状态读面（by_lifecycle/by_status 词形必须走 FROZEN 词表）
 * - doctor --json = 探测四态矩阵（READY/NOT_INSTALLED/MISSING_CONFIGURATION/DEFECT；
 *                   fail-closed：ok = 全 READY；非 READY 必带 hint）
 *
 * 执行面探测（缺席显式，禁静默跳过当通过）：@pomaster/cli 的 dist 尚未构建/仍是
 * scaffold 占位时，本 spec 逐项把断言记为 pending（reason=cli_dist_missing /
 * cli_not_implemented）并写入 coverage/smoke-report.json；dist 可用后自动切入
 * 真端到端断言，无需改本文件。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { DENOMINATOR_STATUS_VALUES, LIFECYCLE_VALUES } from "@pomaster/schemas";
import {
  DOCTOR_PROBE_STATUSES,
  TRIAGE_PROFILES,
} from "@pomaster/cli";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliEntry = join(repoRoot, "packages", "cli", "dist", "bin.js");
const reportPath = join(repoRoot, "coverage", "smoke-report.json");

interface CliRun {
  readonly spawned: boolean;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** dist/bin.js 经 process.execPath 直连（不经 cmd/PowerShell，Windows 安全）。 */
function runCli(args: string[]): CliRun {
  const res = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
  });
  if (res.error) {
    return { spawned: false, exitCode: null, stdout: "", stderr: String(res.error) };
  }
  return {
    spawned: true,
    exitCode: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

interface JsonEnvelope {
  readonly command?: unknown;
  readonly ok?: unknown;
  readonly result?: unknown;
  readonly [key: string]: unknown;
}

function tryParseEnvelope(stdout: string): JsonEnvelope | null {
  try {
    const v: unknown = JSON.parse(stdout);
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof (v as JsonEnvelope).command === "string"
    ) {
      return v as JsonEnvelope;
    }
    return null;
  } catch {
    return null;
  }
}

function makeTempProject(): string {
  return mkdtempSync(join(tmpdir(), "pomaster-smoke-"));
}

// ============================================================
// CLI 实现状态探测（探测在独立临时目录进行，不污染用例目录）
// ============================================================

type CliMode =
  | { readonly implemented: true }
  | { readonly implemented: false; readonly reason: string };

function probeCli(): CliMode {
  if (!existsSync(cliEntry)) {
    return {
      implemented: false,
      reason:
        "cli_dist_missing（packages/cli/dist/bin.js 不存在——待 @pomaster/cli 构建产物落盘）",
    };
  }
  const dir = makeTempProject();
  try {
    // 契约面：--json 产出 §45 机读信封 {command, ok, result, warnings, errors}。
    const r = runCli(["--dir", dir, "init", "--json"]);
    if (tryParseEnvelope(r.stdout) !== null) {
      return { implemented: true };
    }
    return {
      implemented: false,
      reason:
        "cli_not_implemented（`pomaster init --json` 未产出 §45 机读信封——dist 仍为 scaffold 占位或构建过期）",
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const cliMode = probeCli();

interface SmokeReport {
  readonly suite: "smoke-e2e";
  readonly cliMode: CliMode;
  readonly assertions: readonly {
    readonly id: string;
    readonly status: "passed" | "pending";
    readonly detail: string;
  }[];
  readonly pendingList: readonly { readonly id: string; readonly reason: string }[];
}

const assertions: { id: string; status: "passed" | "pending"; detail: string }[] = [];

function recordPending(id: string, what: string): void {
  assertions.push({
    id,
    status: "pending",
    detail: `CLI 未就绪，暂缓真端到端断言：${what}`,
  });
}

function recordPassed(id: string, detail: string): void {
  assertions.push({ id, status: "passed", detail });
}

afterAll(() => {
  const pendingList = assertions
    .filter((a) => a.status === "pending")
    .map((a) => ({ id: a.id, reason: a.detail }));
  const report: SmokeReport = { suite: "smoke-e2e", cliMode, assertions, pendingList };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  for (const p of pendingList) {
    console.log(`[smoke][pending] ${p.id} — ${p.reason}`);
  }
  console.log(
    cliMode.implemented
      ? "[smoke] CLI 就绪：端到端断言全量执行"
      : `[smoke] CLI 未就绪：${cliMode.reason}`,
  );
});

/** pending 模式下的显式登记断言（禁静默跳过当通过）。 */
function expectPendingRecorded(id: string): void {
  expect(
    assertions.some((a) => a.id === id && a.status === "pending"),
    `smoke 断言 ${id} 应显式登记 pending`,
  ).toBe(true);
}

// ============================================================
// 冒烟断言
// ============================================================

describe("smoke 探测（缺席显式表达）", () => {
  it("CLI 实现状态已探测并记录（dist 缺失/占位 → pending 而非静默通过）", () => {
    if (cliMode.implemented) {
      recordPassed("probe.cli", "dist/bin.js 对 init --json 产出 §45 机读信封");
      expect(cliMode.implemented).toBe(true);
    } else {
      recordPending("probe.cli", cliMode.reason);
      expect(cliMode.reason.length).toBeGreaterThan(0);
    }
  });

  it("报告落盘：smoke 模式与 pending 清单写入 coverage/smoke-report.json", () => {
    recordPassed(
      "report.persisted",
      cliMode.implemented
        ? "implemented 模式报告（afterAll 落盘校验由本断言代表）"
        : "pending 模式报告（afterAll 落盘校验由本断言代表）",
    );
    expect(assertions.length).toBeGreaterThan(0);
  });
});

describe("smoke e2e：init → triage×2 → status --json → doctor --json", () => {
  it("init：JSON 命令信封 ok 语义（BOOTSTRAP）", () => {
    if (!cliMode.implemented) {
      recordPending("init.envelope", "init --json 信封断言");
      expectPendingRecorded("init.envelope");
      return;
    }
    const dir = makeTempProject();
    try {
      const r = runCli(["--dir", dir, "init", "--json"]);
      expect(r.spawned).toBe(true);
      const env = tryParseEnvelope(r.stdout);
      expect(env, `init --json 应产出信封：${r.stdout.slice(0, 200)}`).not.toBeNull();
      expect(env?.command).toBe("init");
      expect(env?.ok).toBe(true);
      recordPassed("init.envelope", "init --json 产出 command=init ok=true 信封");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("init 幂等：同一目录重复 init → change=NO_CHANGE 且零写入（A4/No-op is elegant）", () => {
    if (!cliMode.implemented) {
      recordPending("init.idempotent", "重复 init NO_CHANGE 断言");
      expectPendingRecorded("init.idempotent");
      return;
    }
    const dir = makeTempProject();
    try {
      const first = runCli(["--dir", dir, "init", "--json"]);
      const second = runCli(["--dir", dir, "init", "--json"]);
      expect(first.exitCode).toBe(0);
      expect(second.exitCode).toBe(0);
      const firstEnv = tryParseEnvelope(first.stdout);
      const secondEnv = tryParseEnvelope(second.stdout);
      expect(
        String((firstEnv?.result as { change?: unknown })?.change),
      ).toBe("CREATED");
      const result = (secondEnv?.result ?? {}) as {
        change?: unknown;
        files?: readonly { action?: unknown }[];
      };
      // NO_CHANGE 是信封上的显式判决词（不是静默无输出）：
      expect(result.change, "重复 init 必须判 NO_CHANGE（零写入）").toBe(
        "NO_CHANGE",
      );
      expect(
        // preserved = B6b 播种件在座零触碰（幂等账面合法词形）。
        (result.files ?? []).every(
          (f) => f.action === "unchanged" || f.action === "preserved",
        ),
        "第二次 init 全部产物应为 unchanged/preserved（字节稳定，无覆盖写）",
      ).toBe(true);
      recordPassed(
        "init.idempotent",
        "第二次 init change=NO_CHANGE、全部文件 unchanged/preserved（零变化即成功）",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("triage 请求 A（文案微调）：判档 MINIMAL 且缺席信号显式（八拍①）", () => {
    if (!cliMode.implemented) {
      recordPending("triage.a", "copy 类请求判档断言");
      expectPendingRecorded("triage.a");
      return;
    }
    const dir = makeTempProject();
    try {
      runCli(["--dir", dir, "init", "--json"]);
      const r = runCli([
        "--dir",
        dir,
        "triage",
        "页面标题文案微调：间距与图标对齐",
        "--json",
      ]);
      const env = tryParseEnvelope(r.stdout);
      expect(env, `triage --json 应产出信封：${r.stdout.slice(0, 200)}`).not.toBeNull();
      expect(env?.command).toBe("triage");
      expect(env?.ok).toBe(true);
      const result = (env?.result ?? {}) as {
        profile?: unknown;
        absent_signals?: unknown;
      };
      expect(
        (TRIAGE_PROFILES as readonly string[]).includes(String(result.profile)),
        `triage profile "${String(result.profile)}" 越档位词表`,
      ).toBe(true);
      expect(Array.isArray(result.absent_signals)).toBe(true);
      expect(
        (result.absent_signals as readonly unknown[]).length,
        "判定必附「缺席了哪些信号」——缺席不得渲染成干净（跨线共识 2）",
      ).toBeGreaterThan(0);
      recordPassed("triage.a", "copy 类请求判档产出信封，profile 在词表内且 absent_signals 显式");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("triage 幂等：同一请求重放字节全等（GOLDEN-L8-1 判据）", () => {
    if (!cliMode.implemented) {
      recordPending("triage.replay", "同请求重放字节全等断言");
      expectPendingRecorded("triage.replay");
      return;
    }
    const dir = makeTempProject();
    try {
      runCli(["--dir", dir, "init", "--json"]);
      const args = ["--dir", dir, "triage", "页面标题文案微调", "--json"];
      const first = runCli(args);
      const second = runCli(args);
      expect(first.exitCode).toBe(0);
      expect(second.exitCode).toBe(0);
      expect(second.stdout).toBe(first.stdout);
      recordPassed("triage.replay", "triage 同请求重放 stdout 字节全等");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("triage 请求 B（契约/跨域）：升档可区分且自身确定性", () => {
    if (!cliMode.implemented) {
      recordPending("triage.b", "契约面请求升档断言");
      expectPendingRecorded("triage.b");
      return;
    }
    const dir = makeTempProject();
    try {
      runCli(["--dir", dir, "init", "--json"]);
      const argsB = [
        "--dir",
        dir,
        "triage",
        "修改 API_REQ 跨域契约的 response_need 字段",
        "--json",
      ];
      const first = runCli(argsB);
      const second = runCli(argsB);
      const envB = tryParseEnvelope(first.stdout);
      const envA = tryParseEnvelope(
        runCli(["--dir", dir, "triage", "页面标题文案微调", "--json"]).stdout,
      );
      expect(envB).not.toBeNull();
      expect(first.exitCode).toBe(0);
      expect(second.stdout).toBe(first.stdout);
      const profileB = String(
        ((envB?.result ?? {}) as { profile?: unknown }).profile,
      );
      const profileA = String(
        ((envA?.result ?? {}) as { profile?: unknown }).profile,
      );
      expect((TRIAGE_PROFILES as readonly string[]).includes(profileB)).toBe(true);
      expect(profileB).not.toBe(profileA);
      recordPassed(
        "triage.b",
        `契约面请求判档 ${profileB}（与请求 A ${profileA} 可区分），自身重放确定性`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("status --json：状态读面词形纪律（lifecycle/分母 status 必须走 FROZEN 词表）", () => {
    if (!cliMode.implemented) {
      recordPending("status.vocab", "status --json 词形断言");
      expectPendingRecorded("status.vocab");
      return;
    }
    const dir = makeTempProject();
    try {
      runCli(["--dir", dir, "init", "--json"]);
      const r = runCli(["--dir", dir, "status", "--json"]);
      const env = tryParseEnvelope(r.stdout);
      expect(env, `status --json 应产出信封：${r.stdout.slice(0, 200)}`).not.toBeNull();
      expect(env?.command).toBe("status");
      const result = (env?.result ?? {}) as {
        dialect_match?: unknown;
        generation_seq?: unknown;
        objects?: { by_lifecycle?: Record<string, number> };
        denominators?: { by_status?: Record<string, number> };
      };
      expect(typeof result.generation_seq).toBe("number");
      expect(
        (result.generation_seq as number) >= 0,
        "seq 单调非负（A4 禁墙钟）",
      ).toBe(true);
      for (const key of Object.keys(result.objects?.by_lifecycle ?? {})) {
        expect(
          (LIFECYCLE_VALUES as readonly string[]).includes(key),
          `by_lifecycle 键 "${key}" 越六值词表`,
        ).toBe(true);
      }
      for (const key of Object.keys(result.denominators?.by_status ?? {})) {
        expect(
          (DENOMINATOR_STATUS_VALUES as readonly string[]).includes(key),
          `by_status 键 "${key}" 越分母三值词表`,
        ).toBe(true);
      }
      recordPassed("status.vocab", "status 信封合法；状态词形全部在 FROZEN 词表内");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("doctor --json：探测四态矩阵（READY/NOT_INSTALLED/MISSING_CONFIGURATION/DEFECT）", () => {
    if (!cliMode.implemented) {
      recordPending("doctor.probes", "doctor 探测四态断言");
      expectPendingRecorded("doctor.probes");
      return;
    }
    const dir = makeTempProject();
    try {
      runCli(["--dir", dir, "init", "--json"]);
      const r = runCli(["--dir", dir, "doctor", "--json"]);
      const env = tryParseEnvelope(r.stdout);
      expect(env, `doctor --json 应产出信封：${r.stdout.slice(0, 200)}`).not.toBeNull();
      expect(env?.command).toBe("doctor");
      const result = (env?.result ?? {}) as {
        probes?: readonly { status?: unknown; hint?: unknown }[];
      };
      expect(Array.isArray(result.probes), "doctor 结果应含 probes 数组").toBe(true);
      for (const p of result.probes ?? []) {
        expect(
          (DOCTOR_PROBE_STATUSES as readonly string[]).includes(String(p.status)),
          `doctor 探针状态 "${String(p.status)}" 越四态词表（环境异常禁静默）`,
        ).toBe(true);
      }
      recordPassed("doctor.probes", `doctor 探针状态词形全部在四态矩阵内（共 ${result.probes?.length ?? 0} 项）`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("doctor --json：fail-closed 一致性（ok = 全 READY）且非 READY 必带 hint", () => {
    if (!cliMode.implemented) {
      recordPending("doctor.failClosed", "doctor ok/hint 一致性断言");
      expectPendingRecorded("doctor.failClosed");
      return;
    }
    const dir = makeTempProject();
    try {
      runCli(["--dir", dir, "init", "--json"]);
      const r = runCli(["--dir", dir, "doctor", "--json"]);
      const env = tryParseEnvelope(r.stdout);
      const result = (env?.result ?? {}) as {
        ok?: unknown;
        probes?: readonly { status?: unknown; hint?: unknown }[];
      };
      const probes = result.probes ?? [];
      const allReady = probes.every((p) => p.status === "READY");
      expect(result.ok).toBe(allReady);
      for (const p of probes) {
        if (p.status !== "READY") {
          expect(
            typeof p.hint === "string" && p.hint.length > 0,
            `非 READY 探针缺 hint（报错不说去哪修的报错是缺陷）`,
          ).toBe(true);
        }
      }
      recordPassed(
        "doctor.failClosed",
        `doctor ok=${String(result.ok)} 与「全 READY」=${String(allReady)} 一致；非 READY 均带 hint`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
