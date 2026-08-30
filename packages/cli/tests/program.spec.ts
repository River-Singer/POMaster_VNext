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

  it("doctor --json → 矩阵含 kernel / 三工具探针（P22）/ chrome_devtools_mcp 五探针", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "doctor", "--json"], io);
    expect(code).toBe(1);
    const envelope = parseEnvelope(io.out);
    const probes = (envelope.result as { probes: { probe: string }[] }).probes;
    expect(probes.map((p) => p.probe).sort()).toEqual([
      "chrome_devtools_mcp",
      "dependency_cruiser",
      "import_linter",
      "kernel_doctor_probes",
      "oasdiff",
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
      "brainstorm",
      "research",
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

describe("§44.3 六命令参数 fail-closed 与 --help（P18-Adversarial 补全）", () => {
  // —— 用法错误（缺参/多参）：commander 用法错误族 → exit 1 + stderr 提示（信息性放行不覆盖） ——
  it("brainstorm promote 缺 --to → exit 1，stderr 含 '--to'（requiredOption 原文）", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "brainstorm", "promote", "idea-x", "--basis", "msd_reached"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toContain("--to");
  });

  it("brainstorm promote 缺 --basis → exit 1，stderr 含 '--basis'", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "brainstorm", "promote", "idea-x", "--to", "TASK"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toContain("--basis");
  });

  it("brainstorm promote 缺 <discovery-id> → exit 1，stderr 含 'discovery-id'", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "brainstorm", "promote", "--to", "TASK", "--basis", "msd_reached"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toContain("discovery-id");
  });

  it("research 缺 <topic> → exit 1（§44.3 直跑形态的位置参数必填）", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "research"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toContain("topic");
  });

  it("research list 缺 <task-or-discovery> / inspect 缺 <research-id> → 双双 exit 1", async () => {
    const io1 = capture();
    expect(await runCli(["--dir", dir, "research", "list"], io1)).toBe(1);
    expect(io1.err.join("\n")).toContain("task-or-discovery");
    const io2 = capture();
    expect(await runCli(["--dir", dir, "research", "inspect"], io2)).toBe(1);
    expect(io2.err.join("\n")).toContain("research-id");
  });

  it("多余位置参数（brainstorm start extra）→ exit 1（commander excessArguments fail-closed 不吞参数）", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "brainstorm", "start", "extra-arg"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toContain("too many arguments");
  });

  // —— 坏值：run 级词表闸 → 结构化 SCHEMA_INVALID 信封（fail-closed 码位而非裸错） ——
  it("brainstorm promote --to EPIC（词表外落点）→ exit 1，--json 信封 SCHEMA_INVALID + 二选一 hint", async () => {
    const io = capture();
    const code = await runCli(
      ["--dir", dir, "brainstorm", "promote", "idea-x", "--to", "EPIC", "--basis", "msd_reached", "--json"],
      io,
    );
    expect(code).toBe(1);
    const env = parseEnvelope(io.out);
    expect(env.ok).toBe(false);
    expect(env.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(env.errors[0]?.hint).toContain("CHANGE");
    expect(env.errors[0]?.hint).toContain("TASK");
  });

  it("brainstorm promote 缺省 --to/--basis（run 级直调形态）→ SCHEMA_INVALID（闸 0 不猜缺省）", async () => {
    const { runBrainstormPromote } = await import("@pomaster/cli");
    const outcome = await runBrainstormPromote(dir, { discoveryId: "idea-x" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("--to");
  });

  it("research t --mode vibes（词表外模式）→ exit 1，信封 SCHEMA_INVALID + 六词形 hint", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "research", "t", "--mode", "vibes", "--json"], io);
    expect(code).toBe(1);
    const env = parseEnvelope(io.out);
    expect(env.ok).toBe(false);
    expect(env.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(env.errors[0]?.hint).toContain("forensic");
  });

  it("research list <host> --json → 机读信封（混合模式回归：--json 被父命令先行消费时仍出 §45 信封）", async () => {
    // 缺陷史：`research list X --json` 的 --json 被直跑形态的父命令 research 消费，
    // list action 读不到 → 人读文本上了 stdout（§45 机读唯一接口被绕过）。
    // 修复 = list/inspect action 经 optsWithGlobals 读全局值；本例用「宿主不存在」
    // 错误信封钉回归（无需 fixture，信封可解析即证明 --json 生效）。
    const io = capture();
    const code = await runCli(["--dir", dir, "research", "list", ".pomaster/discovery/scratchpads/nope/", "--json"], io);
    expect(code).toBe(1);
    const env = parseEnvelope(io.out);
    expect(env.command).toBe("research list");
    expect(env.ok).toBe(false);
    expect(env.errors[0]?.code).toBe("RESEARCH_HOST_NOT_FOUND");
  });

  // —— --help：六命令的帮助面携带 fail-closed 词汇指引（信息性 exit 0） ——
  it("brainstorm --help → exit 0，含 start/status/promote 三子命令", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "brainstorm", "--help"], io);
    expect(code).toBe(0);
    const text = io.out.join("\n");
    for (const sub of ["start", "status", "promote"]) {
      expect(text).toContain(sub);
    }
    expect(io.err).toEqual([]);
  });

  it("brainstorm promote --help → exit 0，含 --to/--basis/--apply（提升面词汇指引）", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "brainstorm", "promote", "--help"], io);
    expect(code).toBe(0);
    const text = io.out.join("\n");
    for (const flag of ["--to", "--basis", "--apply", "--as"]) {
      expect(text).toContain(flag);
    }
  });

  it("research --help → exit 0，含 --mode 六词形与 list/inspect 子命令", async () => {
    const io = capture();
    const code = await runCli(["--dir", dir, "research", "--help"], io);
    expect(code).toBe(0);
    const text = io.out.join("\n");
    for (const word of ["--mode", "internal", "external", "mixed", "comparative", "impact", "forensic", "list", "inspect"]) {
      expect(text).toContain(word);
    }
  });
});
