/**
 * inspect.spec.ts —— `pomaster inspect <governed-id>`：单对象检视（A1/G1 inspect hole）。
 *
 * 判据：
 * - happy path：正文（02 信封原样）+ 证据（runs/claims 平面按 subject 过滤）+ 谱系
 *   （supersedes/successor_ref/aliases/sources）三维齐备；--json 信封 ok 语义自洽；
 * - alias 收编解析（A6）：legacy 词形 TASK-0087 → TASK.T0087（kernel resolveAlias，
 *   CLI 零自造映射；resolved_via_alias 显式披露）；
 * - 纯读零写入（A1 出口判据）：执行前后 .pomaster 全树字节不变；
 * - fail-closed 错误路径：NOT_INITIALIZED / FATAL_UNKNOWN_PREFIX / OBJECT_NOT_FOUND /
 *   OBJECT_BODY_MISSING（A1 成对纪律：索引行在而正文缺失必报错）/ 正文损坏 SCHEMA_INVALID；
 * - 证据平面损坏 → EVIDENCE_MALFORMED warnings 显式呈现不吞没（检视不整体失败）；
 * - subject 过滤：本对象的证据入列，他对象的证据不入列（不冒充分母）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore } from "@pomaster/kernel";
import { runCli, runInspect, type CliEnvelope, type InspectResult } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-inspect-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 本地 fixture
// ============================================================

const CAP_ID = "CAPABILITY.CSV_TOOL.SERIALIZE_ROWS";
// body_ref 机械映射：id 全小写 + 下划线转连字符（前缀段一并保留）。
const CAP_BODY_REL = "truth/objects/capability/capability.csv-tool.serialize-rows.json";

async function seedStore(): Promise<void> {
  await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
}

async function seedObject(id: string, payload: Record<string, unknown> = {}): Promise<void> {
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id,
          kind: "capability",
          axisProfile: "capability_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "CSV 序列化",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          aliases: ["legacy-serialize"],
          payload,
        } as never,
      },
    ],
  });
}

function bodyPathOf(capId: string): string {
  const local = capId.toLowerCase().replaceAll("_", "-");
  return join(root, ".pomaster", "truth", "objects", "capability", `${local}.json`);
}

function seedClaim(clm: string, subjectId: string): void {
  const dir = join(root, ".pomaster", "evidence", "claims");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${clm}.json`),
    `${JSON.stringify({
      record_type: "claim",
      clm,
      subject: { object_id: subjectId },
      is_fixture: subjectId.startsWith("TEST."),
      assertion: "往返稳定声称",
      asserted_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
      evidence_refs: [],
      verification: { verdict: "UNVERIFIED" },
      rev: 1,
    }, null, 2)}\n`,
  );
}

function seedRun(grn: string, subjectId: string, verdict: string): void {
  const dir = join(root, ".pomaster", "evidence", "runs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${grn}.json`),
    `${JSON.stringify({
      record_type: "run",
      grn,
      ran_at_seq: 2,
      trigger: { type: "on_demand" },
      gate_result: {
        mode: "inline",
        result: { grn, gate: "BUILD", verdict, subject_id: subjectId, ran_at_seq: 2 },
      },
    }, null, 2)}\n`,
  );
}

/** .pomaster 文树快照（相对路径:内容 字节级；inspect 纯读零写入的判据）。 */
function snapshot(): string[] {
  const base = join(root, ".pomaster");
  const entries: string[] = [];
  const walk = (current: string, rel: string): void => {
    let items: ReturnType<typeof readdirSync>;
    try {
      items = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const child = join(current, item.name);
      const childRel = rel === "" ? item.name : `${rel}/${item.name}`;
      if (item.isDirectory()) walk(child, childRel);
      else entries.push(`${childRel}:${readFileSync(child, "utf8")}`);
    }
  };
  walk(base, "");
  return entries.sort();
}

// ============================================================
// happy path：正文 + 证据 + 谱系
// ============================================================

describe("inspect happy path（正文+证据+谱系）", () => {
  it("单对象三维齐备：index_row/body 原样、claim/run 按 subject 入列、lineage 投影", async () => {
    await seedStore();
    // claim 文件先于 upsert 事务落盘——kernel 在事务时扫 claims 平面重算 evidence_summary。
    seedClaim("CLM-0001", CAP_ID);
    seedClaim("CLM-0002", "TEST.OTHER.SUBJECT"); // 他对象——不得冒充本对象证据
    await seedObject(CAP_ID, { surface: "V1" });
    seedRun("GRN-0001", CAP_ID, "failed");
    seedRun("GRN-0002", "TEST.OTHER.SUBJECT", "passed");

    const outcome = await runInspect(root, { id: CAP_ID });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    const result = outcome.result as InspectResult;
    expect(result.id).toBe(CAP_ID);
    expect(result.resolved_via_alias).toBeNull();

    // 索引行原样（snake_case 机器态）。
    expect(result.index_row?.id).toBe(CAP_ID);
    expect(result.index_row?.kind).toBe("capability");
    expect(result.index_row?.authority_owner).toBe("BUSINESS_OWNER");
    expect(result.index_row?.body_ref).toBe(CAP_BODY_REL);
    expect(typeof result.index_row?.body_sha256).toBe("string");

    // 正文原样（02 信封：payload 往返、aliases 在正文不在索引行）。
    expect(result.body?.id).toBe(CAP_ID);
    expect(result.body?.payload).toEqual({ surface: "V1" });
    expect(result.body?.aliases).toEqual(["legacy-serialize"]);

    // 谱系块（只投影正文承载的谱系字段）。
    expect(result.lineage?.supersedes).toBeNull();
    expect(result.lineage?.successor_ref).toBeNull();
    expect(result.lineage?.aliases).toEqual(["legacy-serialize"]);
    expect(result.lineage?.sources).toEqual([]);

    // 证据：本对象 1 run + 1 claim；他对象不入列。
    expect(result.evidence?.runs).toEqual([
      { grn: "GRN-0001", gate: "BUILD", verdict: "failed", ran_at_seq: 2 },
    ]);
    expect(result.evidence?.claims).toHaveLength(1);
    expect(result.evidence?.claims[0]?.clm).toBe("CLM-0001");
    expect(result.evidence?.claims[0]?.verdict).toBe("UNVERIFIED");
    expect(result.evidence?.claims[0]?.asserted_by).toBe("agent:claude/session-93");
    expect(result.evidence?.index_summary).toMatchObject({ claims: 1, unverified: 1 });
  });

  it("legacy 词形收编解析（A6）：TASK-0087 → TASK.T0087，resolved_via_alias 显式披露", async () => {
    await seedStore();
    await seedObject("TASK.T0087");
    const outcome = await runInspect(root, { id: "TASK-0087" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as InspectResult;
    expect(result.resolved_via_alias).toBe("TASK-0087");
    expect(result.id).toBe("TASK.T0087");
    expect(result.index_row?.id).toBe("TASK.T0087");
    expect(outcome.human.join("\n")).toContain("(via alias TASK-0087)");
  });

  it("纯读零写入：执行前后 .pomaster 全树字节不变（A1 出口判据）", async () => {
    await seedStore();
    seedClaim("CLM-0001", CAP_ID);
    await seedObject(CAP_ID);
    const before = snapshot();
    const outcome = await runInspect(root, { id: CAP_ID });
    expect(outcome.ok).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it("--json 信封：exit 0 ok=true；缺位置参数 → commander 用法错误 exit 1", async () => {
    await seedStore();
    await seedObject(CAP_ID);
    const lines: string[] = [];
    const code = await runCli(["--dir", root, "inspect", CAP_ID, "--json"], {
      stdout: (line) => lines.push(line),
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<InspectResult>;
    expect(envelope.command).toBe("inspect");
    expect(envelope.ok).toBe(true);
    expect(envelope.result.id).toBe(CAP_ID);

    const errLines: string[] = [];
    const code2 = await runCli(["--dir", root, "inspect"], {
      stdout: () => undefined,
      stderr: (line) => errLines.push(line),
    });
    expect(code2).toBe(1);
    expect(errLines.join("\n")).toContain("governed-id");
  });
});

// ============================================================
// fail-closed 错误路径
// ============================================================

describe("inspect fail-closed 错误路径", () => {
  it("未初始化 → NOT_INITIALIZED（缺席显式，绝不静默建账）", async () => {
    const outcome = await runInspect(root, { id: CAP_ID });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
    expect(outcome.errors[0]?.hint).toContain("pomaster init");
  });

  it("词表外前缀 → FATAL_UNKNOWN_PREFIX（A5 closed-world，kernel 权威）", async () => {
    await seedStore();
    const outcome = await runInspect(root, { id: "BOGUS.X" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("FATAL_UNKNOWN_PREFIX");
  });

  it("对象缺席 → OBJECT_NOT_FOUND（hint 指向 status 清单）", async () => {
    await seedStore();
    const outcome = await runInspect(root, { id: "CAPABILITY.ABSENT_ONE" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("OBJECT_NOT_FOUND");
    expect(outcome.errors[0]?.hint).toContain("status");
  });

  it("索引行在而正文缺失 → OBJECT_BODY_MISSING（A1 成对纪律，必报错）", async () => {
    await seedStore();
    await seedObject(CAP_ID);
    expect(existsSync(bodyPathOf(CAP_ID))).toBe(true);
    unlinkSync(bodyPathOf(CAP_ID));
    const outcome = await runInspect(root, { id: CAP_ID });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("OBJECT_BODY_MISSING");
    expect(outcome.errors[0]?.message).toContain(CAP_BODY_REL);
  });

  it("正文损坏 → SCHEMA_INVALID（禁静默跳过损坏正文）", async () => {
    await seedStore();
    await seedObject(CAP_ID);
    writeFileSync(bodyPathOf(CAP_ID), "{not json");
    const outcome = await runInspect(root, { id: CAP_ID });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("证据平面损坏 → EVIDENCE_MALFORMED warnings 显式呈现，检视本身不失败", async () => {
    await seedStore();
    await seedObject(CAP_ID);
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(join(runsDir, "GRN-9999.json"), "{not json");
    writeFileSync(join(runsDir, "README.json"), "{}\n"); // 非 GRN 词形
    const outcome = await runInspect(root, { id: CAP_ID });
    expect(outcome.ok).toBe(true); // 旁路证据损坏不整体失败
    expect(outcome.warnings.map((warning) => warning.code)).toEqual([
      "EVIDENCE_MALFORMED",
      "EVIDENCE_MALFORMED",
    ]);
    const result = outcome.result as InspectResult;
    expect(result.evidence?.runs).toEqual([]); // 损坏文件不冒充本对象证据
  });
});
