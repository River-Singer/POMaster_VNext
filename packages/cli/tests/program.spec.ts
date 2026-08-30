/**
 * program.spec.ts —— commander 程序装配：--json 信封契约、退出码、人读双输出。
 *
 * TODO(integration-2026-08-28)：kernel 已落地，原「context compile（kernel
 * scaffold）→ exit 1 KERNEL_NOT_INSTALLED」用例更新为真实 kernel 集成断言
 * （exit 0 信封 ok=true；CLI 设计即 kernel 落地后本命令自动升级）。
 */
import { rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit, runCli, type CliEnvelope } from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-program-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface CapturedIo {
  out: string[];
  err: string[];
}

function capture(): CapturedIo {
  const io: CapturedIo = { out: [], err: [] };
  return {
    out: io.out,
    err: io.err,
    stdout: (line: string) => io.out.push(line),
    stderr: (line: string) => io.err.push(line),
  };
}

function parseEnvelope(lines: string[]): CliEnvelope<unknown> {
  return JSON.parse(lines.join("\n")) as CliEnvelope<unknown>;
}

describe("runCli --json 机读契约（§45）", () => {
  it("triage --json：exit 0，信封 command/ok/result/warnings/errors 五键齐备", async () => {
    const io = capture();
    const code = await runCli(
      ["--dir", dir, "triage", "调整文案", "--json"],
      io,
    );
    expect(code).toBe(0);
    const envelope = parseEnvelope(io.out);
    expect(Object.keys(envelope).sort()).toEqual([
      "command",
      "errors",
      "ok",
      "result",
      "warnings",
    ]);
    expect(envelope.command).toBe("triage");
    expect(envelope.ok).toBe(true);
    expect((envelope.result as { profile: string }).profile).toBe("MINIMAL");
  });

  it("status --json（未初始化）：exit 1，NOT_INITIALIZED 带 hint 路标", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "status", "--json"], io);
    expect(code).toBe(1);
    const envelope = parseEnvelope(io.out);
    expect(envelope.ok).toBe(false);
    expect(
      (envelope.errors as { code: string; hint: string }[])[0]?.code,
    ).toBe("NOT_INITIALIZED");
    expect(
      (envelope.errors as { code: string; hint: string }[])[0]?.hint,
    ).toContain("pomaster init");
  });

  it("init --json 幂等链：第一次 exit 0 CREATED；第二次 NO_CHANGE", async () => {
    const io1 = capture();
    const code1 = await runCli(["--dir", dir, "init", "--json"], io1);
    expect(code1).toBe(0);
    const first = parseEnvelope(io1.out);
    expect((first.result as { change: string }).change).toBe("CREATED");

    const io2 = capture();
    const code2 = await runCli(["--dir", dir, "init", "--json"], io2);
    expect(code2).toBe(0);
    const second = parseEnvelope(io2.out);
    expect((second.result as { change: string }).change).toBe("NO_CHANGE");
  });

  it("context compile --role --json（真实 kernel）→ exit 0，信封 ok=true（kernel 落地后自动升级）", async () => {
    await runInit(dir);
    const io = capture();
    const code = await runCli(
      ["--dir", dir, "context", "compile", "--role", "frontend", "--json"],
      io,
    );
    expect(code).toBe(0);
    const envelope = parseEnvelope(io.out);
    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe("context compile");
    expect((envelope.result as { role?: unknown }).role).toBe("frontend");
  });

  it("context compile 缺 --role → commander 用法错误，exit 1 且 stderr 有提示", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "context", "compile"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toContain("--role");
  });

  it("check --fast --json → 信封为 check 结果且 verdict/ok 语义自洽", async () => {
    // 对真实 gauntlet-lite 模块只断言诚实性不变量（对端并行演进中，不钉具体状态）：
    // ok === (verdict === "passed")——绝不静默通过。
    const io = capture();
    const code = await runCli(
      ["--dir", dir, "check", "--fast", "--json"],
      io,
    );
    const envelope = parseEnvelope(io.out);
    expect(envelope.command).toBe("check");
    const result = envelope.result as {
      verdict: string;
      status: string;
      gate: string;
    };
    expect(result.gate).toBe("BUILD");
    expect(["READY", "NOT_INSTALLED"]).toContain(result.status);
    expect(envelope.ok).toBe(result.verdict === "passed");
    expect(code).toBe(envelope.ok ? 0 : 1);
  });

  it("doctor --json → 矩阵含 kernel 与 chrome_devtools_mcp 两探针", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "doctor", "--json"], io);
    expect(code).toBe(1);
    const envelope = parseEnvelope(io.out);
    const probes = (envelope.result as { probes: { probe: string }[] }).probes;
    expect(probes.map((p) => p.probe).sort()).toEqual([
      "chrome_devtools_mcp",
      "kernel_doctor_probes",
    ]);
  });

  it("未知命令（人读模式）→ exit 1，stderr 带 commander 提示（不裸栈）", async () => {
    // P11 后 maintain 已是真实命令（曾是 README:91 幽灵命令被借作未知命令占位）——
    // 换用确定的词表外命令名做同判据占位。
    const io = capture();
    const code = await runCli(["--dir", dir, "definitely-not-a-command"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toContain("definitely-not-a-command");
  });

  it("未知命令（--json 模式）→ stdout 结构化 UNEXPECTED_ERROR 信封，exit 1", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "definitely-not-a-command", "--json"], io);
    expect(code).toBe(1);
    const envelope = parseEnvelope(io.out);
    expect(envelope.ok).toBe(false);
    expect(
      (envelope.errors as { code: string; message: string }[])[0]?.code,
    ).toBe("UNEXPECTED_ERROR");
    expect(
      (envelope.errors as { code: string; message: string }[])[0]?.message,
    ).toContain("definitely-not-a-command");
  });
});

describe("runCli 人读双输出", () => {
  it("triage 人读：stdout 纯文本，无 ANSI 颜色码（§45 禁彩色当机读）", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "triage", "改样式"], io);
    expect(code).toBe(0);
    const text = io.out.join("\n");
    expect(text).toContain("MINIMAL");
    expect(text).not.toMatch(/\[/);
  });

  it("失败命令人读走 stderr（stdout 保持干净）", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "status"], io);
    expect(code).toBe(1);
    expect(io.out).toEqual([]);
    expect(io.err.join("\n")).toContain("NOT_INITIALIZED");
  });
});

describe("runCli help/version 信息性退出（fresh-clone 实录：--help 曾误入 UNEXPECTED_ERROR exit 1）", () => {
  it("--help → exit 0，stdout 含 usage 与命令清单，stderr 干净", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "--help"], io);
    expect(code).toBe(0);
    const text = io.out.join("\n");
    expect(text).toContain("Usage:");
    for (const cmd of [
      "init",
      "triage",
      "status",
      "inspect",
      "context",
      "doctor",
      "check",
      "eval",
      "permit",
      "exec-guard",
      "reconcile",
      "maintain",
      "compact",
      "record",
    ]) {
      expect(text).toContain(cmd);
    }
    expect(io.err).toEqual([]);
  });

  it("子命令 --help（permit --help）→ exit 0，stdout 含子命令清单", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "permit", "--help"], io);
    expect(code).toBe(0);
    const text = io.out.join("\n");
    expect(text).toContain("Usage:");
    expect(text).toContain("issue");
    expect(text).toContain("steal");
  });

  it("help 子命令 → exit 0（commander.help 信息性退出码）", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "help"], io);
    expect(code).toBe(0);
    expect(io.out.join("\n")).toContain("Usage:");
  });

  it("--version → exit 0（commander.version 信息性退出码）", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "--version"], io);
    expect(code).toBe(0);
    expect(io.out.join("\n")).toContain("0.0.0");
  });

  it("对照：未知命令（commander.usageError 族）仍 fail-closed exit 1，不受信息性放行影响", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "definitely-not-a-command"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toContain("definitely-not-a-command");
  });
});
