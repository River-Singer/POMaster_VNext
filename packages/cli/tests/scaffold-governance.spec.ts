/**
 * scaffold-governance.spec.ts —— 领域规格进治理（11-01-storybook-scaffold S1-2；harness 约束 ①）。
 *
 * 判据：
 * - 规格缺席 → 门不适用；在场未确认 / 不通过校验 / 确认后语义漂移 → closeout 阻断码；
 * - 首次确认不需要通道，写确认记录（语义摘要 + 原始字节摘要 + at_seq + 确认人，history 只追加）
 *   并追加 journal SCAFFOLD_SPEC_CONFIRMED；重复确认幂等零写入；
 * - 只改格式 / 注释不算漂移；改了语义（含把待定决策位定下来）就是漂移；
 * - 漂移后重确认只走 --change：CHANGE 须在册、是 change_object、lifecycle 活性；没有手改声明通道；
 * - --by 只接受 human:；坏确认记录不冒充已确认；判卷故障 fail-closed。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore } from "@pomaster/kernel";
import {
  SCAFFOLD_CONFIRMATION_SCHEMA,
  assessScaffoldSpec,
  readScaffoldConfirmation,
  runCli,
  runScaffoldConfirm,
  runScaffoldStatus,
  scaffoldGateErrors,
  scaffoldSemanticDigest,
  type ScaffoldSpecAssessment,
} from "@pomaster/cli";

const SAMPLE_PATH = fileURLToPath(new URL("../scaffold/examples/fleet.domain-spec.yaml", import.meta.url));
const OWNER = "human:owner";
const SPEC_RELATIVE = ".pomaster/scaffold/domain-spec.yaml";
const RECORD_RELATIVE = ".pomaster/scaffold/confirmation.json";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-scaffold-governance-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function initStore(): Promise<void> {
  await createStore(dir);
  // 治理对象夹具的 owner 须在 authority.json 登记（kernel GHOST_AUTHORITY_OWNER 闸）。
  const authPath = join(dir, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as { authorities: Record<string, unknown> };
  auth.authorities["BOOTSTRAP_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
}

function writeSpec(text: string = readFileSync(SAMPLE_PATH, "utf8")): void {
  mkdirSync(join(dir, ".pomaster", "scaffold"), { recursive: true });
  writeFileSync(join(dir, SPEC_RELATIVE), text);
}

function specText(): string {
  return readFileSync(join(dir, SPEC_RELATIVE), "utf8");
}

function recordText(): string {
  return readFileSync(join(dir, RECORD_RELATIVE), "utf8");
}

function journalLines(): Record<string, unknown>[] {
  const path = join(dir, ".pomaster", "state", "journal.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function assess(): Promise<ScaffoldSpecAssessment> {
  const assessment = await assessScaffoldSpec(dir);
  if (!("state" in assessment)) throw new Error(`assessment failed: ${assessment.code}`);
  return assessment;
}

async function gateCodes(): Promise<string[]> {
  return (await scaffoldGateErrors(dir)).map((error) => error.code);
}

/** 治理通路对象夹具（kernel applyTransaction 唯一写通道；baseline.spec 同款）。 */
async function seedGoverned(
  id: string,
  kind: "change_object" | "task_object" = "change_object",
  lifecycle: "PROPOSED" | "CURRENT" | "SUPERSEDED" = "CURRENT",
): Promise<void> {
  const store = await createStore(dir);
  const evidence = lifecycle === "PROPOSED" ? "PLANNED" : "IMPLEMENTED";
  const classScan = { scope: "src/shared/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-0001" };
  const payload =
    kind === "change_object"
      ? { motivation: "规格变更授权", affected_objects: ["CAPABILITY.DEMO"], reopen_count: 0, class_scan_result: classScan }
      : { intent: "普通任务（非授权载体负例）", acceptance: [], class_scan_result: classScan };
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id,
          kind,
          axisProfile: kind === "change_object" ? "change_default" : "task_default",
          axes: { lifecycle, confidence: "PROVISIONAL", evidence, change: "STABLE" },
          titleZh: "治理通路夹具",
          authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
          origin: "natural",
          ...(lifecycle === "SUPERSEDED" ? { successorRef: "CHANGE.C0001" } : {}),
          payload,
        } as never,
      },
    ],
  });
}

/** 语义变更：给车型加一个内部字段。 */
function addField(text: string): string {
  return text.replace(
    "      - { key: description,",
    "      - { key: color, name_zh: 颜色, type: string, length: 16 }\n      - { key: description,",
  );
}

describe("规格缺席：门不适用", () => {
  it("没有 domain-spec.yaml → absent，closeout 门空，status 照常 exit 0", async () => {
    await initStore();
    expect((await assess()).state).toBe("absent");
    expect(await gateCodes()).toEqual([]);
    const status = await runScaffoldStatus(dir);
    expect(status.ok).toBe(true);
    expect(status.result).toMatchObject({ state: "absent", blocking: [], confirmations: 0 });
  });

  it("confirm 拒绝：SCAFFOLD_SPEC_MISSING，路标指向规格位置", async () => {
    await initStore();
    const outcome = await runScaffoldConfirm(dir, { by: OWNER });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["SCAFFOLD_SPEC_MISSING"]);
    expect(outcome.errors[0]?.hint).toContain(SPEC_RELATIVE);
  });
});

describe("首次确认", () => {
  it("在场未确认 → SCAFFOLD_SPEC_NOT_CONFIRMED；确认写记录 + journal，之后门放行", async () => {
    await initStore();
    writeSpec();
    expect((await assess()).state).toBe("unconfirmed");
    expect(await gateCodes()).toEqual(["SCAFFOLD_SPEC_NOT_CONFIRMED"]);

    const outcome = await runScaffoldConfirm(dir, { by: OWNER });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.change).toBe("CONFIRMED");
    expect(outcome.result.state_before).toBe("unconfirmed");
    expect(outcome.result.change_ref).toBeNull();

    const read = await readScaffoldConfirmation(dir);
    expect(read.kind).toBe("ok");
    if (read.kind !== "ok") return;
    const assessment = await assess();
    expect(read.record.schema).toBe(SCAFFOLD_CONFIRMATION_SCHEMA);
    expect(read.record.spec).toBe(SPEC_RELATIVE);
    expect(read.record.history).toHaveLength(1);
    expect(read.record.current).toEqual(read.record.history[0]);
    expect(read.record.current).toMatchObject({
      by: OWNER,
      change_ref: null,
      semantic_sha256: scaffoldSemanticDigest(assessment.normalized!),
      summary: { app: "fleet", surfaces: ["admin", "public"], entities: ["vehicle_model"] },
    });
    expect(read.record.current.raw_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);

    const events = journalLines().filter((event) => event["type"] === "SCAFFOLD_SPEC_CONFIRMED");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ semantic_sha256: read.record.current.semantic_sha256, change_ref: null, by: OWNER });

    expect(assessment.state).toBe("confirmed");
    expect(await gateCodes()).toEqual([]);
  });

  it("确认结果呈现待项目决定的决策位（不阻断确认）", async () => {
    await initStore();
    writeSpec();
    const outcome = await runScaffoldConfirm(dir, { by: OWNER });
    expect(outcome.result.open_decisions).toEqual({
      admin: ["authentication", "session", "credential_policy", "compliance"],
      public: ["authentication", "session", "credential_policy", "compliance"],
    });
    expect(outcome.human.join("\n")).toContain("待项目决定（admin）：登录方式与认证强度");
  });

  it("重复确认幂等：NO_CHANGE，记录与 journal 零写入", async () => {
    await initStore();
    writeSpec();
    await runScaffoldConfirm(dir, { by: OWNER });
    const before = recordText();
    const eventsBefore = journalLines().length;
    const again = await runScaffoldConfirm(dir, { by: OWNER });
    expect(again.ok).toBe(true);
    expect(again.result.change).toBe("NO_CHANGE");
    expect(recordText()).toBe(before);
    expect(journalLines()).toHaveLength(eventsBefore);
  });

  it("不通过校验的规格不能确认，也不写记录；closeout 门给 SCAFFOLD_SPEC_INVALID", async () => {
    await initStore();
    writeSpec(readFileSync(SAMPLE_PATH, "utf8").replace("access: anonymous", "access: everyone"));
    expect(await gateCodes()).toEqual(["SCAFFOLD_SPEC_INVALID"]);
    const outcome = await runScaffoldConfirm(dir, { by: OWNER });
    expect(outcome.errors.map((error) => error.code)).toEqual(["SCAFFOLD_SPEC_INVALID"]);
    expect(outcome.errors[0]?.message).toContain("SPEC_PUBLIC_ACCESS");
    expect(existsSync(join(dir, RECORD_RELATIVE))).toBe(false);
  });

  it("YAML 坏形同样判 invalid", async () => {
    await initStore();
    writeSpec("schema: [unclosed\n");
    expect((await assess()).state).toBe("invalid");
    expect(await gateCodes()).toEqual(["SCAFFOLD_SPEC_INVALID"]);
  });
});

describe("漂移判定：只认语义", () => {
  it("只改注释、缩进风格、键序 → 仍 confirmed（字节变化单独呈现），门放行，confirm NO_CHANGE", async () => {
    await initStore();
    writeSpec();
    await runScaffoldConfirm(dir, { by: OWNER });
    const reformatted = `# 运维备注：仅格式调整\n${specText()
      .replace("app:\n  key: fleet\n  name_zh: 车队管理\n", "app:\n  name_zh: 车队管理\n  key: fleet\n")
      .replace(/\n/g, "\r\n")}`;
    writeSpec(reformatted);
    const assessment = await assess();
    expect(assessment.state).toBe("confirmed");
    expect(assessment.bytes_changed).toBe(true);
    expect(await gateCodes()).toEqual([]);
    const again = await runScaffoldConfirm(dir, { by: OWNER });
    expect(again.result.change).toBe("NO_CHANGE");
    expect(again.human.join("\n")).toContain("不算漂移");
  });

  it("加字段 → drifted，closeout 门 SCAFFOLD_SPEC_DRIFT", async () => {
    await initStore();
    writeSpec();
    await runScaffoldConfirm(dir, { by: OWNER });
    writeSpec(addField(specText()));
    expect((await assess()).state).toBe("drifted");
    expect(await gateCodes()).toEqual(["SCAFFOLD_SPEC_DRIFT"]);
  });

  it("把待定决策位定下来也是语义变更（决策进规格就受治理）", async () => {
    await initStore();
    writeSpec();
    await runScaffoldConfirm(dir, { by: OWNER });
    writeSpec(specText().replace("  admin: {}", "  admin:\n    decisions:\n      authentication: { choice: 企业 SSO（OIDC）, ref: ADR-0007 }"));
    expect((await assess()).state).toBe("drifted");
  });
});

describe("漂移后重确认只走 --change", () => {
  async function drifted(): Promise<void> {
    await initStore();
    writeSpec();
    await runScaffoldConfirm(dir, { by: OWNER });
    writeSpec(addField(specText()));
  }

  it("不带 --change → SCAFFOLD_RECONFIRM_REQUIRES_CHANGE，零写入", async () => {
    await drifted();
    const before = recordText();
    const outcome = await runScaffoldConfirm(dir, { by: OWNER });
    expect(outcome.errors.map((error) => error.code)).toEqual(["SCAFFOLD_RECONFIRM_REQUIRES_CHANGE"]);
    expect(recordText()).toBe(before);
  });

  it("CHANGE 不在册 / 词形非法 / 指向 TASK / 非活性 → 逐一拒绝", async () => {
    await drifted();
    await seedGoverned("TASK.T0001", "task_object");
    await seedGoverned("CHANGE.C0001", "change_object", "CURRENT");
    await seedGoverned("CHANGE.C0009", "change_object", "SUPERSEDED");
    const codes = async (change: string): Promise<string[]> =>
      (await runScaffoldConfirm(dir, { by: OWNER, change })).errors.map((error) => error.code);
    expect(await codes("CHANGE.C0404")).toEqual(["OBJECT_NOT_FOUND"]);
    expect(await codes("change-1")).toEqual(["SCHEMA_INVALID"]);
    expect(await codes("TASK.T0001")).toEqual(["SCHEMA_INVALID"]);
    expect(await codes("CHANGE.C0009")).toEqual(["SCAFFOLD_CHANGE_NOT_ACTIVE"]);
    expect((await assess()).state).toBe("drifted");
  });

  it("活性 CHANGE → CONFIRMED，history 追加第二条并记 change_ref，门恢复放行", async () => {
    await drifted();
    await seedGoverned("CHANGE.C0001", "change_object", "PROPOSED");
    const outcome = await runScaffoldConfirm(dir, { by: OWNER, change: "CHANGE.C0001" });
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toMatchObject({ change: "CONFIRMED", state_before: "drifted", change_ref: "CHANGE.C0001" });
    const read = await readScaffoldConfirmation(dir);
    if (read.kind !== "ok") throw new Error("record missing");
    expect(read.record.history).toHaveLength(2);
    expect(read.record.history[0]?.change_ref).toBeNull();
    expect(read.record.current.change_ref).toBe("CHANGE.C0001");
    expect(read.record.history[0]?.semantic_sha256).not.toBe(read.record.current.semantic_sha256);
    expect(journalLines().filter((event) => event["type"] === "SCAFFOLD_SPEC_CONFIRMED")).toHaveLength(2);
    expect(await gateCodes()).toEqual([]);
  });

  it("已确认且语义未变时携 --change → SCHEMA_INVALID（没有可授权的变更）", async () => {
    await initStore();
    writeSpec();
    await runScaffoldConfirm(dir, { by: OWNER });
    await seedGoverned("CHANGE.C0001");
    const outcome = await runScaffoldConfirm(dir, { by: OWNER, change: "CHANGE.C0001" });
    expect(outcome.errors.map((error) => error.code)).toEqual(["SCHEMA_INVALID"]);
  });
});

describe("身份、初始化与坏记录", () => {
  it("--by 非 human: / 词形非法 → SCHEMA_INVALID", async () => {
    await initStore();
    writeSpec();
    expect((await runScaffoldConfirm(dir, { by: "agent:claude" })).errors.map((error) => error.code)).toEqual(["SCHEMA_INVALID"]);
    expect((await runScaffoldConfirm(dir, { by: "owner" })).errors.map((error) => error.code)).toEqual(["SCHEMA_INVALID"]);
    expect(existsSync(join(dir, RECORD_RELATIVE))).toBe(false);
  });

  it("store 未初始化 → NOT_INITIALIZED", async () => {
    writeSpec();
    expect((await runScaffoldConfirm(dir, { by: OWNER })).errors.map((error) => error.code)).toEqual(["NOT_INITIALIZED"]);
  });

  it("确认记录损坏 → 按未确认阻断；重新确认重建并给出修复告警", async () => {
    await initStore();
    writeSpec();
    await runScaffoldConfirm(dir, { by: OWNER });
    writeFileSync(join(dir, RECORD_RELATIVE), "{ not json");
    expect(await gateCodes()).toEqual(["SCAFFOLD_SPEC_NOT_CONFIRMED"]);
    expect((await scaffoldGateErrors(dir))[0]?.message).toContain("确认记录损坏");
    const outcome = await runScaffoldConfirm(dir, { by: OWNER });
    expect(outcome.ok).toBe(true);
    expect(outcome.warnings.map((warning) => warning.code)).toEqual(["SCAFFOLD_CONFIRMATION_REPAIRED"]);
    expect(await gateCodes()).toEqual([]);
  });

  it("手改确认记录冒充确认（把摘要改成新规格的）→ 与 journal 对不上，按未确认阻断", async () => {
    await initStore();
    writeSpec();
    await runScaffoldConfirm(dir, { by: OWNER });
    writeSpec(addField(specText()));
    const forged = scaffoldSemanticDigest((await assess()).normalized!);
    const record = JSON.parse(recordText()) as { current: { semantic_sha256: string }; history: { semantic_sha256: string }[] };
    record.current.semantic_sha256 = forged;
    record.history[0]!.semantic_sha256 = forged;
    writeFileSync(join(dir, RECORD_RELATIVE), JSON.stringify(record));
    expect(await gateCodes()).toEqual(["SCAFFOLD_SPEC_NOT_CONFIRMED"]);
    expect((await scaffoldGateErrors(dir))[0]?.message).toContain("journal");
  });

  it("journal 缺失确认事件 → 记录不被采信", async () => {
    await initStore();
    writeSpec();
    await runScaffoldConfirm(dir, { by: OWNER });
    const journal = join(dir, ".pomaster", "state", "journal.jsonl");
    writeFileSync(journal, readFileSync(journal, "utf8").split("\n").filter((line) => !line.includes("SCAFFOLD_SPEC_CONFIRMED")).join("\n"));
    expect(await gateCodes()).toEqual(["SCAFFOLD_SPEC_NOT_CONFIRMED"]);
  });

  it("规格在场但 catalog 不可用 → 判卷故障 fail-closed（不静默放行）", async () => {
    await initStore();
    writeSpec();
    const errors = await scaffoldGateErrors(dir, { catalogRoot: join(dir, "no-catalog") });
    expect(errors.map((error) => error.code)).toEqual(["NOT_CONFIGURED"]);
  });
});

describe("CLI：scaffold confirm / status", () => {
  async function run(argv: readonly string[]): Promise<{ code: number; out: string; err: string }> {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCli([...argv], { stdout: (line) => out.push(line), stderr: (line) => err.push(line) });
    return { code, out: out.join("\n"), err: err.join("\n") };
  }

  it("status 未确认：exit 0，--json 列出 closeout 阻断码；confirm 后 status 呈现已确认", async () => {
    await initStore();
    writeSpec();
    const before = await run(["--dir", dir, "scaffold", "status", "--json"]);
    expect(before.code).toBe(0);
    expect(JSON.parse(before.out).result).toMatchObject({ state: "unconfirmed", blocking: ["SCAFFOLD_SPEC_NOT_CONFIRMED"] });

    const confirm = await run(["--dir", dir, "scaffold", "confirm", "--by", OWNER]);
    expect(confirm.code).toBe(0);
    expect(confirm.out).toContain("scaffold confirm: CONFIRMED");

    const after = await run(["--dir", dir, "scaffold", "status"]);
    expect(after.code).toBe(0);
    expect(after.out).toContain("scaffold status: 已确认");
    expect(after.out).toContain("实体：vehicle_model");
  });

  it("confirm 失败 exit 1，--json 信封带错误码", async () => {
    await initStore();
    const failed = await run(["--dir", dir, "scaffold", "confirm", "--by", OWNER, "--json"]);
    expect(failed.code).toBe(1);
    expect(JSON.parse(failed.out)).toMatchObject({ ok: false, errors: [{ code: "SCAFFOLD_SPEC_MISSING" }] });
  });
});
