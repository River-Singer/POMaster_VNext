/**
 * memory.spec.ts —— `pomaster memory` 六命令命令面测试（P33b · PRD §44.10 词形逐字
 * + §48.4/§48.5 + Case N）。
 *
 * 判卷权威在 @pomaster/kernel memory-harvest.ts（P33a 已全量单测）；本文件钉命令
 * 编排语义：六命令 exit code + --json 信封词形 + 错误路径词形族
 * （MEMORY_CLI_ERROR_VALUES——schemas vocab.ts P33b 段单一镜像点）。
 *
 * 测试卫生：fixture 全部 mkdtemp（pomaster-p33-fixture- 前缀）+ afterEach 整树删除；
 * harness 记忆探测位一律注入临时目录（绝不触碰真实 ~/.claude ~/.codex ~/.pomaster）；
 * user-scope 台账根注入临时目录（§48.6 不随 repo 提交）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore } from "@pomaster/kernel";
import {
  claudeProjectSlugOf,
  defaultHarnessMemoryDir,
  runCli,
  type CliEnvelope,
} from "@pomaster/cli";

let dir: string;
const roots: string[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-p33-fixture-cli-"));
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

function errorCodesOf(env: CliEnvelope<Record<string, unknown>>): string[] {
  const errors = env.errors as { code: string }[] | undefined;
  return (errors ?? []).map((e) => e.code);
}

/** 写一份 harness memory fixture 文件（kernel tests 同款三参形态）。 */
function writeHarnessFile(harnessDir: string, name: string, content: string): void {
  mkdirSync(harnessDir, { recursive: true });
  writeFileSync(join(harnessDir, name), content, "utf8");
}

// ============================================================
// memory capture
// ============================================================

describe("pomaster memory capture（§44.10 词形之一；STRICT 统一入口）", () => {
  it("--text → exit 0：inbox 条目 PENDING/UNCLASSIFIED_PENDING/LOW 落盘（信封词形全量）", async () => {
    const { code, env } = await runJson(["memory", "capture", "--text", "记住：页面分母 39"]);
    expect(code).toBe(0);
    expect(env.ok).toBe(true);
    const result = env.result as {
      action: string;
      id: string;
      batch: string;
      scope: string;
      source: string;
      review_state: string;
      proposal_bucket: string;
      confidence: string;
      path: string;
    };
    expect(result.action).toBe("capture");
    expect(result.id).toMatch(/^HM-[0-9a-f]{12}$/);
    expect(result.batch).toBe("capture");
    expect(result.scope).toBe("project");
    expect(result.source).toBe("user_capture");
    expect(result.review_state).toBe("PENDING");
    expect(result.proposal_bucket).toBe("UNCLASSIFIED_PENDING");
    expect(result.confidence).toBe("LOW");
    expect(result.path).toBe(`.pomaster/memory/inbox/capture/${result.id}.json`);
    expect(existsSync(join(dir, ".pomaster/memory/inbox/capture", `${result.id}.json`))).toBe(true);
  });

  it("--scope user → 信封 scope=user（§44.10 逐字两值）", async () => {
    const { code, env } = await runJson([
      "memory",
      "capture",
      "--text",
      "记住：回复语言偏好是中文",
      "--scope",
      "user",
    ]);
    expect(code).toBe(0);
    expect((env.result as { scope: string }).scope).toBe("user");
  });

  it("同文重复捕获 → exit 1 MEMORY_CAPTURE_DUPLICATE（内容寻址 id 撞册显式）", async () => {
    await runJson(["memory", "capture", "--text", "重复捕获样本"]);
    const { code, env } = await runJson(["memory", "capture", "--text", "重复捕获样本"]);
    expect(code).toBe(1);
    expect(env.ok).toBe(false);
    expect(errorCodeOf(env)).toBe("MEMORY_CAPTURE_DUPLICATE");
  });

  it("空白 --text / --scope 词表外 → exit 1 SCHEMA_INVALID（fail-closed）", async () => {
    const blank = await runJson(["memory", "capture", "--text", "   "]);
    expect(blank.code).toBe(1);
    expect(errorCodeOf(blank.env)).toBe("SCHEMA_INVALID");
    const badScope = await runJson(["memory", "capture", "--text", "x", "--scope", "team"]);
    expect(badScope.code).toBe(1);
    expect(errorCodeOf(badScope.env)).toBe("SCHEMA_INVALID");
  });
});

// ============================================================
// memory inspect
// ============================================================

describe("pomaster memory inspect（§44.10 词形之二；inbox 总览纯读）", () => {
  it("空 inbox → exit 0 显式空合法态（分母封闭 0=0+0+0；buckets 七桶零填充）+ 人读显式空行", async () => {
    const { code, env } = await runJson(["memory", "inspect"]);
    expect(code).toBe(0);
    const result = env.result as {
      identity_ok: boolean;
      totals: { total: number; pending: number };
      buckets: Record<string, number>;
      pending_entries: unknown[];
    };
    expect(result.identity_ok).toBe(true);
    expect(result.totals).toEqual({ total: 0, pending: 0, promoted: 0, rejected: 0 });
    expect(result.buckets.TRUTH).toBe(0);
    expect(result.buckets.UNCLASSIFIED_PENDING).toBe(0);
    expect(result.pending_entries).toEqual([]);
    const human = capture();
    const humanCode = await runCli(["--dir", dir, "memory", "inspect"], human);
    expect(humanCode).toBe(0);
    expect(human.out.join("\n")).toContain("显式空");
  });

  it("capture ×2 + decide ×1 → 各桶计数/分母封闭/PENDING 清单如实呈现", async () => {
    const a = await runJson(["memory", "capture", "--text", "inspect 样本一"]);
    await runJson(["memory", "capture", "--text", "inspect 样本二"]);
    const idA = (a.env.result as { id: string }).id;
    await runJson([
      "memory",
      "review",
      "--decide",
      idA,
      "--promote",
      "--note",
      "裁决样本",
    ]);
    const { code, env } = await runJson(["memory", "inspect"]);
    expect(code).toBe(0);
    const result = env.result as {
      identity_ok: boolean;
      totals: { total: number; pending: number; promoted: number; rejected: number };
      pending_entries: { id: string }[];
    };
    expect(result.identity_ok).toBe(true);
    expect(result.totals).toEqual({ total: 2, pending: 1, promoted: 1, rejected: 0 });
    expect(result.pending_entries).toHaveLength(1);
    expect(result.pending_entries[0]?.id).not.toBe(idA);
  });
});

// ============================================================
// memory harvest
// ============================================================

describe("pomaster memory harvest（§44.10 词形之三；COMPATIBILITY 模式）", () => {
  it("--harness-dir 三份 fixture → exit 0 HARVESTED：3 条全 PENDING 入 inbox（词形预筛三态齐呈现）", async () => {
    const harnessDir = join(dir, "harness-memory");
    writeHarnessFile(
      harnessDir,
      "formula-count-outdated.md",
      "# 已废弃的计数记忆\n公式数=42（Current Truth=58，被后续事实推翻）",
    );
    writeHarnessFile(
      harnessDir,
      "grid-failure-lessons.md",
      "# 失败模式\nBatch write pipelines without transactional primitives recur destructive rewrite",
    );
    writeHarnessFile(harnessDir, "random-notes.md", "正文无任何桶信号词面");
    const { code, env } = await runJson([
      "memory",
      "harvest",
      "claude",
      "--harness-dir",
      harnessDir,
    ]);
    expect(code).toBe(0);
    expect(env.ok).toBe(true);
    const result = env.result as {
      status: string;
      batch: string;
      scanned: number;
      harvested: { bucket: string; confidence: string }[];
      skipped_existing: string[];
      unclassified: number;
    };
    expect(result.status).toBe("HARVESTED");
    expect(result.batch).toBe("harvest-claude");
    expect(result.scanned).toBe(3);
    expect(result.harvested).toHaveLength(3);
    const buckets = result.harvested.map((entry) => entry.bucket).sort();
    expect(buckets).toEqual(["INVALID_EXPIRED", "KNOWLEDGE", "UNCLASSIFIED_PENDING"]);
    expect(result.unclassified).toBe(1);
    const inspect = await runJson(["memory", "review", "--list"]);
    const entries = (inspect.env.result as { entries: { review_state: string }[] }).entries;
    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.review_state === "PENDING")).toBe(true);
  });

  it("目录缺席 / 零 md 文件 → exit 1 MEMORY_HARVEST_NOT_RUN（显式 not_run 非 fake 绿）", async () => {
    const missing = await runJson([
      "memory",
      "harvest",
      "claude",
      "--harness-dir",
      join(dir, "no-such-dir"),
    ]);
    expect(missing.code).toBe(1);
    expect(missing.env.ok).toBe(false);
    expect(errorCodeOf(missing.env)).toBe("MEMORY_HARVEST_NOT_RUN");
    expect((missing.env.result as { not_run_reason: string | null }).not_run_reason).toBe(
      "HARNESS_PATH_MISSING",
    );
    expect(existsSync(join(dir, ".pomaster/memory/inbox"))).toBe(false);
    const emptyDir = join(dir, "empty-harness");
    mkdirSync(emptyDir, { recursive: true });
    writeFileSync(join(emptyDir, "not-markdown.txt"), "ignored", "utf8");
    const empty = await runJson(["memory", "harvest", "claude", "--harness-dir", emptyDir]);
    expect(empty.code).toBe(1);
    expect((empty.env.result as { not_run_reason: string | null }).not_run_reason).toBe(
      "HARNESS_MEMORY_EMPTY",
    );
  });

  it("非 claude harness 无 --harness-dir → exit 1 SCHEMA_INVALID（缺省探测仅注册 claude——禁猜测路径）", async () => {
    const { code, env } = await runJson(["memory", "harvest", "codex"]);
    expect(code).toBe(1);
    expect(errorCodeOf(env)).toBe("SCHEMA_INVALID");
    expect(
      (env.errors as { message: string }[])[0]?.message,
    ).toContain("claude");
  });

  it("claudeProjectSlugOf 确定性派生 + defaultHarnessMemoryDir 词形闸（真实 home 零触碰）", () => {
    expect(claudeProjectSlugOf("d:\\Vscode Documents\\po-master")).toBe(
      "d--Vscode-Documents-po-master",
    );
    expect(claudeProjectSlugOf("/home/user/my project")).toBe("-home-user-my-project");
    const claude = defaultHarnessMemoryDir("claude", "d:\\work\\demo app");
    expect("dir" in claude && claude.dir.endsWith("projects/d--work-demo-app/memory")).toBe(true);
    const codex = defaultHarnessMemoryDir("codex", "d:\\work");
    expect("error" in codex).toBe(true);
  });
});

// ============================================================
// memory review
// ============================================================

describe("pomaster memory review（§44.10 词形之四；batch review 唯一人工闸）", () => {
  async function captureOne(text: string): Promise<string> {
    const { env } = await runJson(["memory", "capture", "--text", text]);
    return (env.result as { id: string }).id;
  }

  it("缺省 = PENDING 队列；--list 全量；--state/--bucket 词表外 → SCHEMA_INVALID", async () => {
    const idA = await captureOne("review 样本一");
    await captureOne("review 样本二");
    await runJson(["memory", "review", "--decide", idA, "--promote", "--note", "ok"]);
    const queue = await runJson(["memory", "review"]);
    expect(queue.code).toBe(0);
    const queueEntries = (queue.env.result as { entries: { review_state: string }[] }).entries;
    expect(queueEntries).toHaveLength(1);
    expect(queueEntries[0]?.review_state).toBe("PENDING");
    const all = await runJson(["memory", "review", "--list"]);
    expect((all.env.result as { entries: unknown[] }).entries).toHaveLength(2);
    const promoted = await runJson(["memory", "review", "--list", "--state", "PROMOTED"]);
    expect((promoted.env.result as { entries: unknown[] }).entries).toHaveLength(1);
    const badState = await runJson(["memory", "review", "--list", "--state", "MAYBE"]);
    expect(badState.code).toBe(1);
    expect(errorCodeOf(badState.env)).toBe("SCHEMA_INVALID");
    const badBucket = await runJson(["memory", "review", "--list", "--bucket", "MAYBE"]);
    expect(badBucket.code).toBe(1);
    expect(errorCodeOf(badBucket.env)).toBe("SCHEMA_INVALID");
  });

  it("--decide 缺方向 / 缺 --note / id 缺席 → SCHEMA_INVALID ×2 + MEMORY_ENTRY_NOT_FOUND", async () => {
    const id = await captureOne("decide 防线样本");
    const noDirection = await runJson(["memory", "review", "--decide", id, "--note", "x"]);
    expect(noDirection.code).toBe(1);
    expect(errorCodeOf(noDirection.env)).toBe("SCHEMA_INVALID");
    const noNote = await runJson(["memory", "review", "--decide", id, "--promote"]);
    expect(noNote.code).toBe(1);
    expect(errorCodeOf(noNote.env)).toBe("SCHEMA_INVALID");
    const missing = await runJson([
      "memory",
      "review",
      "--decide",
      "HM-000000000000",
      "--promote",
      "--note",
      "x",
    ]);
    expect(missing.code).toBe(1);
    expect(errorCodeOf(missing.env)).toBe("MEMORY_ENTRY_NOT_FOUND");
  });

  it("--decide --promote --note → exit 0 PROMOTED（原文零改写：text 字节恒等落盘）", async () => {
    const id = await captureOne("零改写铁律 CLI 样本");
    const path = join(dir, ".pomaster/memory/inbox/capture", `${id}.json`);
    const before = JSON.parse(readFileSync(path, "utf8")) as { text: string };
    const { code, env } = await runJson([
      "memory",
      "review",
      "--decide",
      id,
      "--promote",
      "--note",
      "batch review 2026-08-31",
    ]);
    expect(code).toBe(0);
    const decided = (env.result as { decided: { review_state: string; note: string } }).decided;
    expect(decided.review_state).toBe("PROMOTED");
    expect(decided.note).toBe("batch review 2026-08-31");
    const after = JSON.parse(readFileSync(path, "utf8")) as { text: string };
    expect(after.text).toBe(before.text); // 原文零改写
  });

  it("已决条目再决 → exit 1 MEMORY_ALREADY_REVIEWED（review 三态封闭）", async () => {
    const id = await captureOne("再决拒绝 CLI 样本");
    await runJson(["memory", "review", "--decide", id, "--reject", "--note", "一次否决"]);
    const again = await runJson(["memory", "review", "--decide", id, "--promote", "--note", "翻案"]);
    expect(again.code).toBe(1);
    expect(errorCodeOf(again.env)).toBe("MEMORY_ALREADY_REVIEWED");
  });

  it("--decide --reclassify-bucket/class → 只改分类标签（TRUTH 时 needs_conflict_check 重算）", async () => {
    const id = await captureOne("reclassify CLI 样本");
    const { code, env } = await runJson([
      "memory",
      "review",
      "--decide",
      id,
      "--promote",
      "--note",
      "reclassify to TRUTH",
      "--reclassify-bucket",
      "TRUTH",
      "--reclassify-class",
      "TRUTH",
    ]);
    expect(code).toBe(0);
    const decided = (
      env.result as { decided: { bucket: string; memory_class: string | null } }
    ).decided;
    expect(decided.bucket).toBe("TRUTH");
    expect(decided.memory_class).toBe("TRUTH");
    const path = join(dir, ".pomaster/memory/inbox/capture", `${id}.json`);
    const onDisk = JSON.parse(readFileSync(path, "utf8")) as { needs_conflict_check: boolean };
    expect(onDisk.needs_conflict_check).toBe(true);
  });
});

// ============================================================
// memory promote
// ============================================================

describe("pomaster memory promote（§44.10 词形之五；分桶路由）", () => {
  async function promotedKnowledgeEntry(): Promise<string> {
    const { env } = await runJson(["memory", "capture", "--text", "promote KNOWLEDGE CLI 样本"]);
    const id = (env.result as { id: string }).id;
    await runJson([
      "memory",
      "review",
      "--decide",
      id,
      "--promote",
      "--note",
      "k",
      "--reclassify-bucket",
      "KNOWLEDGE",
      "--reclassify-class",
      "KNOWLEDGE",
    ]);
    return id;
  }

  it("未 init → NOT_INITIALIZED；PENDING → MEMORY_REVIEW_REQUIRED；缺席 id → MEMORY_ENTRY_NOT_FOUND", async () => {
    const fresh = mkdtempSync(join(tmpdir(), "pomaster-p33-fixture-fresh-"));
    roots.push(fresh);
    const io = capture();
    const code = await runCli(
      ["--dir", fresh, "memory", "promote", "HM-000000000001", "--actor", "human:owner", "--json"],
      io,
    );
    expect(code).toBe(1);
    expect(errorCodeOf(parseEnvelope(io.out))).toBe("NOT_INITIALIZED");
    await createStore(dir);
    const captureResult = await runJson(["memory", "capture", "--text", "PENDING 不可直接晋升样本"]);
    const pendingId = (captureResult.env.result as { id: string }).id;
    const pending = await runJson(["memory", "promote", pendingId, "--actor", "human:owner"]);
    expect(pending.code).toBe(1);
    expect(errorCodeOf(pending.env)).toBe("MEMORY_REVIEW_REQUIRED");
    const missing = await runJson(["memory", "promote", "HM-000000000000", "--actor", "human:owner"]);
    expect(missing.code).toBe(1);
    expect(errorCodeOf(missing.env)).toBe("MEMORY_ENTRY_NOT_FOUND");
  });

  it("KNOWLEDGE 桶：缺申报 SCHEMA_INVALID ×2；全申报 → exit 0 route=knowledge_library 恒 CANDIDATE+ADVISORY；再晋升 MEMORY_ALREADY_PROMOTED", async () => {
    await createStore(dir);
    const id = await promotedKnowledgeEntry();
    const noId = await runJson(["memory", "promote", id, "--actor", "human:owner"]);
    expect(noId.code).toBe(1);
    expect(errorCodeOf(noId.env)).toBe("SCHEMA_INVALID");
    const noKind = await runJson([
      "memory",
      "promote",
      id,
      "--actor",
      "human:owner",
      "--knowledge-id",
      "KNOWLEDGE.FE.CLI.SAMPLE",
    ]);
    expect(noKind.code).toBe(1);
    expect(errorCodeOf(noKind.env)).toBe("SCHEMA_INVALID");
    const { code, env, io } = await runJson([
      "memory",
      "promote",
      id,
      "--actor",
      "human:owner",
      "--knowledge-id",
      "KNOWLEDGE.FE.CLI.SAMPLE",
      "--knowledge-kind",
      "FAILURE_PATTERN",
      "--knowledge-title",
      "CLI 样本失败模式",
    ]);
    expect(code).toBe(0);
    expect(env.ok).toBe(true);
    const result = env.result as {
      route: string;
      knowledge_id: string;
      knowledge_status: string;
      knowledge_authority: string;
      owner_escalation: unknown[];
    };
    expect(result.route).toBe("knowledge_library");
    expect(result.knowledge_id).toBe("KNOWLEDGE.FE.CLI.SAMPLE");
    expect(result.knowledge_status).toBe("CANDIDATE"); // P28 生命周期恒 CANDIDATE 起步
    expect(result.knowledge_authority).toBe("ADVISORY"); // 恒 ADVISORY（§83.2）
    expect(result.owner_escalation).toEqual([]);
    expect(io.out.join("\n")).toContain("CANDIDATE");
    const again = await runJson([
      "memory",
      "promote",
      id,
      "--actor",
      "human:owner",
      "--knowledge-id",
      "KNOWLEDGE.FE.CLI.SAMPLE",
      "--knowledge-kind",
      "FAILURE_PATTERN",
    ]);
    expect(again.code).toBe(1);
    expect(errorCodeOf(again.env)).toBe("MEMORY_ALREADY_PROMOTED");
  });

  it("TRUTH 桶 → exit 0 + OWNER_ESCALATION_REQUIRED warning + owner_escalation 非空（不冒充成功也不 fail 误报）", async () => {
    await createStore(dir);
    const { env } = await runJson(["memory", "capture", "--text", "后端=已发布 178 opIds（TRUTH CLI 呈报样本）"]);
    const id = (env.result as { id: string }).id;
    await runJson([
      "memory",
      "review",
      "--decide",
      id,
      "--promote",
      "--note",
      "现状基线陈述",
      "--reclassify-bucket",
      "TRUTH",
      "--reclassify-class",
      "TRUTH",
    ]);
    const { code, env: promoteEnv, io } = await runJson([
      "memory",
      "promote",
      id,
      "--actor",
      "human:owner",
    ]);
    expect(code).toBe(0); // 呈报语义：exit 0 不 fail 误报
    expect(promoteEnv.ok).toBe(true);
    expect(warningCodesOf(promoteEnv)).toContain("OWNER_ESCALATION_REQUIRED");
    const result = promoteEnv.result as {
      route: string;
      owner_escalation: { id: string; memory_class: string | null; upgraded: boolean }[];
    };
    expect(result.route).toBe("escalate_owner");
    expect(result.owner_escalation).toHaveLength(1);
    expect(result.owner_escalation[0]?.id).toBe(id);
    expect(result.owner_escalation[0]?.memory_class).toBe("TRUTH");
    expect(result.owner_escalation[0]?.upgraded).toBe(false);
    expect(io.out.join("\n")).toContain("OWNER_ESCALATION_REQUIRED");
  });

  it("AUTHORITY_POLICY：无申报 → MEMORY_PROMOTE_OWNER_REQUIRED；--authority-upgrade → exit 0 upgraded=true 呈报", async () => {
    await createStore(dir);
    const { env } = await runJson(["memory", "capture", "--text", "commit 纪律：只提交 pomaster/（升格 CLI 样本）"]);
    const id = (env.result as { id: string }).id;
    await runJson([
      "memory",
      "review",
      "--decide",
      id,
      "--promote",
      "--note",
      "用户明令确认",
      "--reclassify-bucket",
      "AUTHORITY_POLICY",
      "--reclassify-class",
      "DECISION",
    ]);
    const denied = await runJson(["memory", "promote", id, "--actor", "human:owner"]);
    expect(denied.code).toBe(1);
    expect(errorCodeOf(denied.env)).toBe("MEMORY_PROMOTE_OWNER_REQUIRED");
    const upgraded = await runJson([
      "memory",
      "promote",
      id,
      "--actor",
      "human:owner",
      "--authority-upgrade",
    ]);
    expect(upgraded.code).toBe(0);
    const result = upgraded.env.result as {
      owner_escalation: { upgraded: boolean }[];
    };
    expect(result.owner_escalation[0]?.upgraded).toBe(true);
    expect(warningCodesOf(upgraded.env)).toContain("OWNER_ESCALATION_REQUIRED");
  });

  it("USER 桶 → exit 0 route=user_ledger（注入台账根落账；项目树零台账文件）", async () => {
    await createStore(dir);
    const userRoot = mkdtempSync(join(tmpdir(), "pomaster-p33-fixture-user-"));
    roots.push(userRoot);
    const { env } = await runJson(["memory", "capture", "--text", "回复语言偏好是中文（USER CLI 样本）", "--scope", "user"]);
    const id = (env.result as { id: string }).id;
    await runJson([
      "memory",
      "review",
      "--decide",
      id,
      "--promote",
      "--note",
      "真实偏好确认",
      "--reclassify-bucket",
      "PREFERENCE",
      "--reclassify-class",
      "USER",
    ]);
    const { code, env: promoteEnv } = await runJson([
      "memory",
      "promote",
      id,
      "--actor",
      "human:owner",
      "--user-memory-root",
      userRoot,
    ]);
    expect(code).toBe(0);
    const result = promoteEnv.result as { route: string; ledger_path: string };
    expect(result.route).toBe("user_ledger");
    expect(result.ledger_path).toBe(`${userRoot}/memory-ledger.json`);
    expect(existsSync(join(userRoot, "memory-ledger.json"))).toBe(true);
    expect(existsSync(join(dir, ".pomaster/user-memory-ledger.json"))).toBe(false);
  });

  it("REJECTED 终态 → MEMORY_ALREADY_REVIEWED（被拒条目无晋升通路）", async () => {
    await createStore(dir);
    const id = await (async () => {
      const { env } = await runJson(["memory", "capture", "--text", "REJECTED 晋升拒绝样本"]);
      const id = (env.result as { id: string }).id;
      await runJson(["memory", "review", "--decide", id, "--reject", "--note", "淘汰"]);
      return id;
    })();
    const { code, env } = await runJson(["memory", "promote", id, "--actor", "human:owner"]);
    expect(code).toBe(1);
    expect(errorCodeOf(env)).toBe("MEMORY_ALREADY_REVIEWED");
  });
});

// ============================================================
// memory audit
// ============================================================

describe("pomaster memory audit（§44.10 词形之六；Case N fail-closed）", () => {
  it("纯绿（无 drift）→ exit 0：分母封闭 + 七桶计数 + drift 段全零", async () => {
    await runJson(["memory", "capture", "--text", "audit 纯绿样本"]);
    const { code, env } = await runJson([
      "memory",
      "audit",
      "--harness-memory-root",
      join(dir, "no-such-harness-root"),
    ]);
    expect(code).toBe(0);
    expect(env.ok).toBe(true);
    const result = env.result as {
      identity_ok: boolean;
      totals: { total: number; pending: number };
      drift: { detected: boolean; inbox_entry_id: string | null; entered_inbox: boolean };
    };
    expect(result.identity_ok).toBe(true);
    expect(result.totals).toEqual({ total: 1, pending: 1, promoted: 0, rejected: 0 });
    expect(result.drift.detected).toBe(false);
    expect(result.drift.inbox_entry_id).toBeNull();
    expect(result.drift.entered_inbox).toBe(false);
    expect(errorCodesOf(env)).toEqual([]);
  });

  it("Case N：harness 记忆位存在 + 项目记忆为空 → exit 1 MEMORY_DRIFT + drift 项入 inbox PENDING（幂等去重）", async () => {
    await createStore(dir);
    const harnessRoot = mkdtempSync(join(tmpdir(), "pomaster-p33-fixture-harness-"));
    roots.push(harnessRoot);
    const first = await runJson([
      "memory",
      "audit",
      "--harness-memory-root",
      harnessRoot,
    ]);
    expect(first.code).toBe(1); // fail-closed
    expect(first.env.ok).toBe(false);
    expect(errorCodesOf(first.env)).toEqual(["MEMORY_DRIFT"]);
    const result = first.env.result as {
      drift: { detected: boolean; entered_inbox: boolean; inbox_entry_id: string | null };
    };
    expect(result.drift.detected).toBe(true);
    expect(result.drift.entered_inbox).toBe(true);
    expect(result.drift.inbox_entry_id).toMatch(/^HM-[0-9a-f]{12}$/);
    // drift 条目在 inbox：PENDING + source=memory_drift_audit（不得自动成为 Truth）。
    const list = await runJson(["memory", "review", "--list", "--batch", "audit-drift"]);
    const entries = (list.env.result as { entries: { source: string; review_state: string; bucket: string }[] }).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.source).toBe("memory_drift_audit");
    expect(entries[0]?.review_state).toBe("PENDING");
    expect(entries[0]?.bucket).toBe("UNCLASSIFIED_PENDING");
    // 幂等：重跑同文同 id 去重，不重复入册（仍是 exit 1——drift 信号在册不静默绿）。
    const rerun = await runJson(["memory", "audit", "--harness-memory-root", harnessRoot]);
    expect(rerun.code).toBe(1);
    expect((rerun.env.result as typeof result).drift.entered_inbox).toBe(false);
    expect((rerun.env.result as typeof result).drift.inbox_entry_id).toBe(
      result.drift.inbox_entry_id,
    );
  });

  it("人读输出（非 --json）：drift 行 + §84.6 处置注记呈现（失败人读走 stderr）", async () => {
    await createStore(dir);
    const harnessRoot = mkdtempSync(join(tmpdir(), "pomaster-p33-fixture-harness2-"));
    roots.push(harnessRoot);
    const io = capture();
    const code = await runCli(["--dir", dir, "memory", "audit", "--harness-memory-root", harnessRoot], io);
    expect(code).toBe(1);
    const text = [...io.err, ...io.out].join("\n");
    expect(text).toContain("MEMORY_DRIFT");
    expect(text).toContain("§84.6");
    expect(text).toContain("不得自动成为 Truth");
  });
});

// ============================================================
// 红队攻击面回归（P33 修复轮封条——CLI 呈现面）
// ============================================================

describe("memory audit 红队回归（修复轮封条）", () => {
  it("攻击面4b 封条：探测 NOT_RUN → probe_status=NOT_RUN + exit 1 MEMORY_HARVEST_NOT_RUN（未知≠绿，不折叠 not detected）", async () => {
    await createStore(dir);
    // NUL 字节路径 → statSync 非 ENOENT → P32 层 NOT_RUN（portability.spec 先例构造）。
    const { code, env } = await runJson([
      "memory",
      "audit",
      "--harness-memory-root",
      join(dir, "bad\0path"),
    ]);
    expect(code).toBe(1);
    expect(env.ok).toBe(false);
    const result = env.result as {
      empty: boolean;
      drift: { probe_status: string; probe_status_detail: string | null; detected: boolean };
    };
    expect(result.drift.probe_status).toBe("NOT_RUN");
    expect(result.drift.detected).toBe(false);
    expect(result.drift.probe_status_detail).toContain("不可探测");
    const codes = errorCodesOf(env);
    expect(codes).toContain("MEMORY_HARVEST_NOT_RUN");
    // 不入 inbox：探测未执行没有 drift 事实。
    const list = await runJson(["memory", "review", "--list"]);
    const entries = (list.env.result as { entries: unknown[] }).entries;
    expect(entries.filter((e) => (e as { source?: string }).source === "memory_drift_audit")).toHaveLength(0);
  });

  it("显式空态：零条目 inbox → envelope empty=true + 人读面「显式空态」（空≠静默健康）", async () => {
    await createStore(dir);
    const { code, env } = await runJson([
      "memory",
      "audit",
      "--harness-memory-root",
      join(dir, "no-such-harness-root"),
    ]);
    expect(code).toBe(0);
    const result = env.result as { empty: boolean; totals: { total: number } };
    expect(result.empty).toBe(true);
    expect(result.totals.total).toBe(0);
    const io = capture();
    const code2 = await runCli(["--dir", dir, "memory", "audit", "--harness-memory-root", join(dir, "no-such-harness-root")], io);
    expect(code2).toBe(0);
    expect([...io.err, ...io.out].join("\n")).toContain("显式空态");
  });
});
