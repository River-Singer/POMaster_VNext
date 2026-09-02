/**
 * trace-cli.spec.ts —— Execution Trace 命令面（W1-C2 · PRD v0.5.2 §8 + §14 P0.5-3；
 * OD-5 已批词形 `trace show <AGX>` / `trace list`，Owner 裁决 8 ②）。
 *
 * 判据锚（docs/kernel-api.md §23.3 契约）：
 * - 注册面：trace 组 + show/list 两 leaf（readme-command-surface 双向锚依赖本注册）；
 * - --json 信封：§45 五键 + mode/manifest/stale 结构化呈现；
 * - 缺席显式：store 未初始化 NOT_INITIALIZED / 档案未登记 EXECUTION_NOT_FOUND /
 *   词形非法 SCHEMA_INVALID（§16 Case A 禁自造第二种 EXEC-* 身份）；
 * - fail-closed：--seal 缺 --retention、--retention 孤值（CLI argv 预检 IO 前）、
 *   retention 词表外 VOCAB_INVALID_VALUE（kernel 唯一裁决位——CLI 零判卷）、
 *   重复封存 TRACE_ALREADY_SEALED；
 * - stale 对账：封存后 post-hoc 补录 → stale=true 显式呈现非错误（exit 0——快照与
 *   新鲜投影各有审计语义，漂移是信号不是故障）；
 * - 双平面：EPHEMERAL → runtime/traces/（可丢弃）；其余 → traces/（durable）；
 * - 零墙钟断言：CLI 结果面不得引入时间戳字段（A4——manifest 派生面 seq 锚定）。
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  beginExecution,
  createStore,
} from "@pomaster/kernel";
import { createProgram, runCli, type CliEnvelope } from "@pomaster/cli";
import { gid, makeStore, pageEnvelope } from "../../../packages/kernel/tests/helpers.js";

let root: string;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
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

const BASE = {
  role: "orchestrator",
  runtime: "claude-code",
  identityKind: "interactive",
} as const;

/** 经 kernel 直调登记一个执行档案（身份供给归 execution begin 通路——S1 禁自造）。 */
async function seedExecution(startedAt = "2026-08-30T00:00:00.000Z"): Promise<string> {
  const store = await createStore(root);
  const record = await beginExecution(store, { ...BASE, startedAt });
  return record.execution_id;
}

/** 登记执行 + 盖章一笔写入事务（TX_APPLIED.changed_object_ids → 投影 writes 分母）。 */
async function seedExecutionWithWrite(): Promise<string> {
  const store = await createStore(root);
  const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
  await applyTransaction(store, {
    ops: [{ op: "upsert_object", envelope: pageEnvelope() as never }],
    executionId: record.execution_id,
  });
  return record.execution_id;
}

// ============================================================
// 注册面 + --help 词形
// ============================================================

describe("trace 命令组注册面与 --help 词形（OD-5 已批词形）", () => {
  it("createProgram 注册 trace 组且恰含 show/list 两子命令（注册面锚——readme-command-surface 双向绿依赖）", () => {
    const program = createProgram();
    const trace = program.commands.find((command) => command.name() === "trace");
    expect(trace).toBeDefined();
    expect(trace?.commands.map((sub) => sub.name()).sort()).toEqual(["list", "show"]);
  });

  it("trace --help → exit 0，含 show/list 两子命令词形（§45 帮助面）", async () => {
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "--help"], io);
    expect(code).toBe(0);
    const text = io.out.join("\n");
    expect(text).toContain("Usage:");
    expect(text).toContain("show");
    expect(text).toContain("list");
    expect(io.err).toEqual([]);
  });

  it("trace show --help → exit 0，含 --seal/--retention 与四档词形提示（裁决 8 ② retention 逐字词形）", async () => {
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "show", "--help"], io);
    expect(code).toBe(0);
    const text = io.out.join("\n");
    for (const word of ["--seal", "--retention", "EPHEMERAL", "TASK_RETENTION", "INCIDENT_RETENTION", "AUDIT_RETENTION"]) {
      expect(text, `trace show --help 须呈现 ${word}`).toContain(word);
    }
  });

  it("trace list --help → exit 0（信息性退出）", async () => {
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "list", "--help"], io);
    expect(code).toBe(0);
    expect(io.out.join("\n")).toContain("Usage:");
  });
});

// ============================================================
// 缺席显式（NOT_INITIALIZED / EXECUTION_NOT_FOUND / 词形非法）
// ============================================================

describe("trace show 缺席显式（fail-closed 不假绿）", () => {
  it("未初始化目录 → exit 1 NOT_INITIALIZED + init 指路 hint", async () => {
    const absent = join(root, "..", "trace-cli-absent-fixture");
    const io = capture();
    const code = await runCli(["--dir", absent, "trace", "show", "AGX-2026-00001", "--json"], io);
    expect(code).toBe(1);
    const envelope = parseEnvelope(io.out);
    expect(envelope.command).toBe("trace show");
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("NOT_INITIALIZED");
    expect(envelope.errors[0]?.hint).toContain("init");
  });

  it("合法词形但档案未登记 → exit 1 EXECUTION_NOT_FOUND（§16 Case A：禁自造身份——档案是存在性事实源）", async () => {
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "show", "AGX-2026-99999", "--json"], io);
    expect(code).toBe(1);
    const envelope = parseEnvelope(io.out);
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("EXECUTION_NOT_FOUND");
  });

  it("词形非法（EXEC-* 第二词形）→ exit 1 SCHEMA_INVALID（§16 Case A 逐字：不得自造第二种身份）", async () => {
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "show", "EXEC-1", "--json"], io);
    expect(code).toBe(1);
    const envelope = parseEnvelope(io.out);
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(envelope.errors[0]?.message).toContain("AGX");
  });

  it("缺 <execution-id> 位置参数 → commander 用法错误 exit 1，stderr 含 'execution-id'", async () => {
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "show"], io);
    expect(code).toBe(1);
    expect(io.err.join("\n")).toContain("execution-id");
  });
});

// ============================================================
// 投影形态（--json 信封 + 纯读）
// ============================================================

describe("trace show 投影形态（§45 --json 信封 + Lite 边界显式）", () => {
  it("空执行 → exit 0 mode=projection，manifest 12 键显式 + Lite 恒空面（reads/agent_spawns 空、retention/derived_from_seq null）", async () => {
    const executionId = await seedExecution();
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "show", executionId, "--json"], io);
    expect(code).toBe(0);
    const envelope = parseEnvelope(io.out);
    expect(envelope.command).toBe("trace show");
    expect(envelope.ok).toBe(true);
    const result = envelope.result as {
      execution_id: string;
      mode: string;
      manifest: Record<string, unknown>;
      plane: string | null;
      path: string | null;
      stale: boolean | null;
    };
    expect(result.execution_id).toBe(executionId);
    expect(result.mode).toBe("projection");
    expect(result.plane).toBeNull();
    expect(result.path).toBeNull();
    expect(result.stale).toBeNull();
    expect(Object.keys(result.manifest).sort()).toEqual(
      [
        "agent_spawns", "derived_from_seq", "evidence_refs", "execution_id",
        "raw_trace_ref", "reads", "retention", "schema", "tool_receipts",
        "trace_version", "transition_proposals", "writes",
      ].sort(),
    );
    expect(result.manifest.retention).toBeNull();
    expect(result.manifest.derived_from_seq).toBeNull();
    expect(result.manifest.reads).toEqual({ governed_refs: [], source_areas: [] });
    expect(result.manifest.schema).toBe("pomaster.execution_trace/v1");
  });

  it("有写入的执行 → 投影携带 writes.governed_refs（TX_APPLIED 派生——CLI 零判卷零采集）", async () => {
    const executionId = await seedExecutionWithWrite();
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "show", executionId, "--json"], io);
    expect(code).toBe(0);
    const envelope = parseEnvelope(io.out);
    const result = envelope.result as { manifest: { writes: { governed_refs: string[] } } };
    expect(result.manifest.writes.governed_refs).toEqual(["PAGE.DASHBOARD"]);
  });

  it("人读模式：stdout 纯文本含 PROJECTION 词形与 --seal 指路；无 ANSI 颜色码", async () => {
    const executionId = await seedExecution();
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "show", executionId], io);
    expect(code).toBe(0);
    const text = io.out.join("\n");
    expect(text).toContain("PROJECTION");
    expect(text).toContain(executionId);
    expect(text).toContain("--seal");
    expect(text).not.toMatch(/\[/);
  });
});

// ============================================================
// 封存形态（--seal --retention 成对 + stale 对账 + 双平面）
// ============================================================

describe("trace show --seal --retention（显式物化——裁决 8 ② OD-2）", () => {
  it("TASK_RETENTION 封存 → exit 0 mode=sealed + traces/ 落盘 + derived_from_seq 锚；重复封存 → TRACE_ALREADY_SEALED exit 1", async () => {
    const executionId = await seedExecution();
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "show", executionId, "--seal", "--retention", "TASK_RETENTION", "--json"], io);
    expect(code).toBe(0);
    const envelope = parseEnvelope(io.out);
    const result = envelope.result as {
      mode: string;
      plane: string;
      path: string;
      stale: boolean;
      manifest: { retention: string; derived_from_seq: number };
    };
    expect(result.mode).toBe("sealed");
    expect(result.plane).toBe("durable");
    expect(result.stale).toBe(false);
    expect(result.manifest.retention).toBe("TASK_RETENTION");
    expect(typeof result.manifest.derived_from_seq).toBe("number");
    expect(existsSync(join(root, ".pomaster", "traces", `${executionId}.json`))).toBe(true);

    const io2 = capture();
    const code2 = await runCli(["--dir", root, "trace", "show", executionId, "--seal", "--retention", "AUDIT_RETENTION", "--json"], io2);
    expect(code2).toBe(1);
    const envelope2 = parseEnvelope(io2.out);
    expect(envelope2.ok).toBe(false);
    expect(envelope2.errors[0]?.code).toBe("TRACE_ALREADY_SEALED");
  });

  it("EPHEMERAL → runtime/traces/ 平面（§85.4 可丢弃语义——裁决 8 ② OD-1=B 分层）", async () => {
    const executionId = await seedExecution();
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "show", executionId, "--seal", "--retention", "EPHEMERAL", "--json"], io);
    expect(code).toBe(0);
    const envelope = parseEnvelope(io.out);
    const result = envelope.result as { plane: string; path: string };
    expect(result.plane).toBe("ephemeral");
    expect(result.path.split("\\").join("/")).toContain(".pomaster/runtime/traces");
  });

  it("--seal 缺 --retention → exit 1 SCHEMA_INVALID（CLI argv 预检 IO 前；--retention 是治理承诺不留缺省）", async () => {
    const executionId = await seedExecution();
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "show", executionId, "--seal", "--json"], io);
    expect(code).toBe(1);
    const envelope = parseEnvelope(io.out);
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(envelope.errors[0]?.message).toContain("--retention");
  });

  it("--retention 孤值（无 --seal）→ exit 1 SCHEMA_INVALID（投影形态恒 null——retention 只随封存写入）", async () => {
    const executionId = await seedExecution();
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "show", executionId, "--retention", "TASK_RETENTION", "--json"], io);
    expect(code).toBe(1);
    const envelope = parseEnvelope(io.out);
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(envelope.errors[0]?.message).toContain("--seal");
  });

  it("retention 词表外 → exit 1 VOCAB_INVALID_VALUE（kernel 唯一裁决位——CLI 零判卷不复制第二套词表闸）", async () => {
    const executionId = await seedExecution();
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "show", executionId, "--seal", "--retention", "FOREVER", "--json"], io);
    expect(code).toBe(1);
    const envelope = parseEnvelope(io.out);
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("VOCAB_INVALID_VALUE");
    expect(envelope.errors[0]?.hint).toContain("EPHEMERAL");
  });

  it("封存在座时缺省 show → 呈现封存快照（mode=sealed + retention/derived_from_seq 回显，非投影冒充）", async () => {
    const executionId = await seedExecution();
    expect(
      await runCli(["--dir", root, "trace", "show", executionId, "--seal", "--retention", "INCIDENT_RETENTION"], capture()),
    ).toBe(0);
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "show", executionId, "--json"], io);
    expect(code).toBe(0);
    const envelope = parseEnvelope(io.out);
    const result = envelope.result as {
      mode: string;
      stale: boolean;
      manifest: { retention: string };
    };
    expect(result.mode).toBe("sealed");
    expect(result.stale).toBe(false);
    expect(result.manifest.retention).toBe("INCIDENT_RETENTION");
  });

  it("封存后 post-hoc 补录 → stale=true 显式呈现且 exit 0（漂移是信号不是故障——canonical 重放对账）", async () => {
    const executionId = await seedExecutionWithWrite();
    expect(
      await runCli(["--dir", root, "trace", "show", executionId, "--seal", "--retention", "TASK_RETENTION"], capture()),
    ).toBe(0);
    // post-hoc：同执行追加一笔新事务（合法通路——封存快照由此 stale）。
    const store = await createStore(root);
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope({ id: gid("PAGE.OTHER") }) as never }],
      executionId,
    });
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "show", executionId, "--json"], io);
    expect(code).toBe(0);
    const envelope = parseEnvelope(io.out);
    expect(envelope.ok).toBe(true);
    const result = envelope.result as { mode: string; stale: boolean };
    expect(result.mode).toBe("sealed");
    expect(result.stale).toBe(true);
    // stale 的人读呈现走 human 半边（--json 模式 stdout 只有机读信封）。
    const ioHuman = capture();
    expect(await runCli(["--dir", root, "trace", "show", executionId], ioHuman)).toBe(0);
    expect(ioHuman.out.join("\n")).toContain("stale=true");
  });

  it("零墙钟：封存落盘 JSON 身份字段不带时间戳（A4——derived_from_seq 是唯一事件锚）", async () => {
    const executionId = await seedExecution();
    expect(
      await runCli(["--dir", root, "trace", "show", executionId, "--seal", "--retention", "TASK_RETENTION"], capture()),
    ).toBe(0);
    const raw = readFileSync(join(root, ".pomaster", "traces", `${executionId}.json`), "utf8");
    for (const key of Object.keys(JSON.parse(raw) as Record<string, unknown>)) {
      expect(key.endsWith("_at") || key.endsWith("_utc"), `键 ${key} 不得携带墙钟语义（A4）`).toBe(false);
    }
  });
});

// ============================================================
// trace list（封存清单；空 = 显式空）
// ============================================================

describe("trace list（双平面清单）", () => {
  it("空清单 → exit 0 显式空（traces=[] 机读 + 「0 sealed traces」人读行——空≠静默）", async () => {
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "list", "--json"], io);
    expect(code).toBe(0);
    const envelope = parseEnvelope(io.out);
    expect(envelope.command).toBe("trace list");
    expect(envelope.ok).toBe(true);
    expect(envelope.result).toEqual({ traces: [] });
    // 人读半边（§45 双输出）：显式空行只在 human 模式呈现（--json 模式 stdout 只有机读信封）。
    const ioHuman = capture();
    expect(await runCli(["--dir", root, "trace", "list"], ioHuman)).toBe(0);
    expect(ioHuman.out.join("\n")).toContain("0 sealed traces");
  });

  it("双平面各封存一条 → 2 行（execution_id 字典序；plane/retention/derived_from_seq 逐键回显）", async () => {
    const first = await seedExecution("2026-08-30T00:00:00.000Z");
    const second = await seedExecution("2026-08-30T00:01:00.000Z");
    expect(
      await runCli(["--dir", root, "trace", "show", first, "--seal", "--retention", "AUDIT_RETENTION"], capture()),
    ).toBe(0);
    expect(
      await runCli(["--dir", root, "trace", "show", second, "--seal", "--retention", "EPHEMERAL"], capture()),
    ).toBe(0);
    const io = capture();
    const code = await runCli(["--dir", root, "trace", "list", "--json"], io);
    expect(code).toBe(0);
    const envelope = parseEnvelope(io.out);
    const result = envelope.result as {
      traces: { execution_id: string; retention: string; plane: string; derived_from_seq: number }[];
    };
    expect(result.traces.map((row) => row.execution_id)).toEqual([first, second].sort());
    expect(result.traces.every((row) => typeof row.derived_from_seq === "number")).toBe(true);
    const planes = new Map(result.traces.map((row) => [row.execution_id, row] as const));
    expect(planes.get(first)?.plane).toBe("durable");
    expect(planes.get(first)?.retention).toBe("AUDIT_RETENTION");
    expect(planes.get(second)?.plane).toBe("ephemeral");
    expect(planes.get(second)?.retention).toBe("EPHEMERAL");
  });

  it("未初始化目录 → exit 1 NOT_INITIALIZED（缺席显式——不静默建账）", async () => {
    const absent = join(root, "..", "trace-cli-absent-list-fixture");
    const io = capture();
    const code = await runCli(["--dir", absent, "trace", "list", "--json"], io);
    expect(code).toBe(1);
    expect((parseEnvelope(io.out).errors as { code: string }[])[0]?.code).toBe("NOT_INITIALIZED");
  });
});
