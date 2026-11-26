// autopilot escalate 台账钉测（code-spec qa-cases.md TC-1b 段；PRD 11-11-agent-autopilot D-7）：
// append-only（唯一写通路追加、无 resolve/删改口）、context 闭集、subject/reason 必填、
// 未初始化 NOT_INITIALIZED、空台账显式呈现。
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAutopilotEscalateList, runAutopilotEscalateRecord, ESCALATION_CONTEXTS } from "../src/autopilot-escalate.js";
import { runInit } from "../src/init.js";

let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-escalate-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const ledgerPath = () => join(dir, ".pomaster", "autopilot", "escalations.jsonl");

describe("autopilot escalate 台账", () => {
  it("未初始化：NOT_INITIALIZED 零建账（缺席显式，不静默建账）", () => {
    expect(runAutopilotEscalateRecord(dir, { context: "qa", subject: "CASE-0001", reason: "预期冲突" }).errors[0]?.code).toBe("NOT_INITIALIZED");
    expect(runAutopilotEscalateList(dir, {}).errors[0]?.code).toBe("NOT_INITIALIZED");
    expect(existsSync(ledgerPath())).toBe(false);
  });

  it("词形门：subject/reason 缺席各自错误码；context 越界 SCHEMA_INVALID", async () => {
    expect((await runInit(dir)).ok).toBe(true);
    expect(runAutopilotEscalateRecord(dir, { context: "qa", reason: "有依据" }).errors[0]?.code).toBe("AUTOPILOT_ESCALATE_SUBJECT_REQUIRED");
    expect(runAutopilotEscalateRecord(dir, { context: "qa", subject: "CASE-0001" }).errors[0]?.code).toBe("AUTOPILOT_ESCALATE_REASON_REQUIRED");
    expect(runAutopilotEscalateRecord(dir, { context: "随便", subject: "CASE-0001", reason: "有依据" }).errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(existsSync(ledgerPath())).toBe(false);
    expect(ESCALATION_CONTEXTS).toEqual(["qa", "plan", "execution", "test-weakening", "other"]);
  });

  it("追加与连号：record 两条 seq 连号 ESC-####；首行字节不被第二条改动（append-only）", async () => {
    expect((await runInit(dir)).ok).toBe(true);
    const first = runAutopilotEscalateRecord(dir, { context: "qa", subject: "CASE-0012", reason: "预期结果与原型冲突，需要人裁定", refs: ["REQ-0007"] });
    expect(first.ok, JSON.stringify(first.errors)).toBe(true);
    expect(first.result).toMatchObject({ id: "ESC-0001", seq: 1 });
    const firstLine = readFileSync(ledgerPath(), "utf8");
    const second = runAutopilotEscalateRecord(dir, { context: "test-weakening", subject: "orders.spec.ts", reason: "403→200 断言被改——检测命中，挂人阅" });
    expect(second.result).toMatchObject({ id: "ESC-0002", seq: 2 });
    const both = readFileSync(ledgerPath(), "utf8");
    expect(both.startsWith(firstLine)).toBe(true);
    expect(both.split("\n").filter((line) => line.trim() !== "").length).toBe(2);
  });

  it("list：空台账显式呈现（非空白假绿）；全部/open 过滤", async () => {
    expect((await runInit(dir)).ok).toBe(true);
    const empty = runAutopilotEscalateList(dir, {});
    expect(empty.ok).toBe(true);
    expect(empty.result).toMatchObject({ total: 0, open: 0, shown: 0 });
    expect(empty.human.some((line) => line.includes("台账空"))).toBe(true);

    runAutopilotEscalateRecord(dir, { context: "qa", subject: "CASE-0012", reason: "需要人裁定" });
    runAutopilotEscalateRecord(dir, { context: "plan", subject: "TASK.X", reason: "范围冲突" });
    const listed = runAutopilotEscalateList(dir, {});
    expect(listed.result).toMatchObject({ total: 2, open: 2, shown: 2 });
    const openOnly = runAutopilotEscalateList(dir, { open: true });
    expect(openOnly.result).toMatchObject({ total: 2, open: 2, shown: 2 });
    expect(listed.human.some((line) => line.includes("ESC-0001") && line.includes("CASE-0012"))).toBe(true);
    expect(listed.human.some((line) => line.includes("需要人裁定"))).toBe(true);
  });
});
