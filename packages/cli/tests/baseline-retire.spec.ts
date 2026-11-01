/**
 * baseline-retire.spec.ts —— 确认目标不适用退役 / 撤销退役（VNext 优化 V2-6；台账 VX-WRITE-06）。
 *
 * 判据（plan V2-6）：
 * - 纯前端项目退役后端目标后 confirm 不再要求它们（未知键不阻塞、文件不读）；
 * - 退役后文件被改不报漂移；unretire 后恢复判定（退役期间改过 / 从未确认过 → 漂移，走治理通路）；
 * - 非 human: 执行者被拒（V5-4 前过渡口径）；重复退役 / 撤销未退役 = NO_CHANGE 零写入；
 * - 任务范围：--lanes 与列全校验用有效目标；撤销退役后未覆盖该目标的旧声明判 MALFORMED，
 *   task reassess-baseline 恢复；
 * - 在途变更批里的目标不能退役；退役 / 撤销在同一条 ADVANCE 链上交替。
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore, sha256OfUtf8 } from "@pomaster/kernel";
import {
  BASELINE_CONFIRM_TARGETS,
  BASELINE_LANES,
  STACK_KEYS,
  baselineConfirmationHumanLine,
  baselineGateAssessment,
  baselineGateErrors,
  buildBaselineDependencyDeclaration,
  readBaselineConfirmation,
  readBaselineConfirmationPresentation,
  runBaselineConfirm,
  runBaselineRetire,
  runBaselineSet,
  runBaselineUnretire,
  runInit,
  runTaskReassessBaseline,
  unknownsWordForm,
} from "@pomaster/cli";
import { baselineTargetsForLanes } from "../src/baseline.js";
import { readTaskBaselineDependencies } from "../src/evidence-qualification.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-baseline-retire-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const OWNER = "human:owner";
const BACKEND_TARGETS = BASELINE_CONFIRM_TARGETS.filter((target) => target.startsWith("baseline/backend/"));

function read(relative: string): string {
  return readFileSync(join(dir, relative), "utf8");
}

function targetPath(target: string): string {
  return join(dir, ".pomaster", ...target.split("/"));
}

async function fillKeys(lanes: readonly ("frontend" | "backend")[] = BASELINE_LANES): Promise<void> {
  for (const lane of lanes) {
    for (const key of STACK_KEYS[lane]) {
      const outcome = await runBaselineSet(dir, { lane, key, value: key === "cache" || key === "grid" ? "none" : `${key}-value` });
      expect(outcome.ok, `${lane}.${key}`).toBe(true);
    }
  }
}

async function buildConfirmedProject(): Promise<void> {
  expect((await runInit(dir, { platforms: "claude" })).ok).toBe(true);
  await fillKeys();
  expect((await runBaselineConfirm(dir)).result.change).toBe("CONFIRMED");
}

function snapshot(): string[] {
  const base = join(dir, ".pomaster");
  const entries: string[] = [];
  const walk = (current: string, rel: string): void => {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, item.name);
      const childRel = rel === "" ? item.name : `${rel}/${item.name}`;
      if (item.isDirectory()) walk(child, childRel);
      else entries.push(`${childRel}:${readFileSync(child, "utf8")}`);
    }
  };
  walk(base, "");
  return entries.sort();
}

function ledger(): { entries: Record<string, unknown>[]; reinstatements?: Record<string, unknown>[] } {
  return JSON.parse(read(".pomaster/state/retirements.json")) as { entries: Record<string, unknown>[]; reinstatements?: Record<string, unknown>[] };
}

function advance(adv: string): Record<string, unknown> {
  return (JSON.parse(read(`.pomaster/state/advances/${adv}.json`)) as { advance: Record<string, unknown> }).advance;
}

const retire = (target: string, overrides: Partial<Parameters<typeof runBaselineRetire>[1]> = {}) =>
  runBaselineRetire(dir, { target, notApplicable: true, reason: "纯前端项目，后端由第三方 BaaS 提供", by: OWNER, ...overrides });
const unretire = (target: string, overrides: Partial<Parameters<typeof runBaselineUnretire>[1]> = {}) =>
  runBaselineUnretire(dir, { target, reason: "自建导出服务，后端重新适用", by: OWNER, ...overrides });

describe("baseline retire：不适用目标退出确认分母（V2-6）", () => {
  it("纯前端项目：后端目标退役后 confirm 不再要求它们（未知键不阻塞），记录对它们写退役哨兵", async () => {
    expect((await runInit(dir, { platforms: "claude" })).ok).toBe(true);
    await fillKeys(["frontend"]);
    const blocked = await runBaselineConfirm(dir);
    expect(blocked.errors[0]?.code).toBe("BASELINE_UNKNOWNS_REMAINING");
    expect(blocked.errors[0]?.message).toContain(unknownsWordForm("backend", STACK_KEYS.backend[0] as string));

    for (const target of BACKEND_TARGETS) {
      const outcome = await retire(target);
      expect(outcome.errors).toEqual([]);
      expect(outcome.result.change).toBe("RETIRED");
    }
    expect(ledger().entries.map((entry) => [entry.id, entry.kind, entry.actor])).toEqual(
      BACKEND_TARGETS.map((target) => [target, "baseline_target_not_applicable", OWNER]),
    );
    const first = advance("ADV-0001");
    expect(first.old_anchor).toMatchObject({ kind: "baseline_target", ref: `${BACKEND_TARGETS[0]}#applicability` });
    expect(first.affected_ids).toEqual(["BASELINE.PROJECT"]);

    const confirmed = await runBaselineConfirm(dir);
    expect(confirmed.errors).toEqual([]);
    expect(confirmed.result.change).toBe("CONFIRMED");
    const read1 = await readBaselineConfirmation(dir);
    if (read1.kind !== "record-valid") throw new Error("expected record");
    expect(read1.state).toBe("confirmed");
    expect(read1.retired).toEqual(BACKEND_TARGETS);
    const backendStack = BACKEND_TARGETS.find((target) => target.endsWith("stack.yaml")) as string;
    expect(read1.record.digests[backendStack]).not.toBe(sha256OfUtf8(readFileSync(targetPath(backendStack), "utf8")));

    const presentation = await readBaselineConfirmationPresentation(dir);
    expect(presentation?.retired_targets).toEqual(BACKEND_TARGETS);
    expect(presentation?.blocking_remaining).toBe(0);
    expect(baselineConfirmationHumanLine(presentation!)).toContain(`已退役（不适用）${BACKEND_TARGETS.length} 个目标`);

    const set = await runBaselineSet(dir, { lane: "backend", key: STACK_KEYS.backend[0] as string, value: "java" });
    expect(set.errors[0]?.code).toBe("BASELINE_TARGET_RETIRED");
  });

  it("退役后文件被改不报漂移；unretire 后恢复判定（改过 → 漂移，经 --ack-drifted 重确认）", async () => {
    await buildConfirmedProject();
    const target = "baseline/backend/architecture.md";
    expect((await retire(target)).result.change).toBe("RETIRED");
    writeFileSync(targetPath(target), "# backend architecture\n## Layers\n- 退役期间被改\n");
    const quiet = await readBaselineConfirmation(dir);
    if (quiet.kind !== "record-valid") throw new Error("expected record");
    expect(quiet.state).toBe("confirmed");
    expect(await baselineGateErrors(dir)).toEqual([]);

    const restored = await unretire(target);
    expect(restored.errors).toEqual([]);
    expect(restored.result).toMatchObject({ change: "UNRETIRED", retired_targets: [] });
    expect(ledger().reinstatements).toEqual([expect.objectContaining({ id: target, kind: "baseline_target_not_applicable", actor: OWNER })]);
    const drifted = await readBaselineConfirmation(dir);
    if (drifted.kind !== "record-valid") throw new Error("expected record");
    expect(drifted.state).toBe("drifted");
    expect(drifted.mismatches.map((mismatch) => mismatch.target)).toEqual([target]);
    expect((await runBaselineConfirm(dir, { ackDrifted: true, note: "后端架构重新适用，Owner 已审阅" })).result.change).toBe("CONFIRMED");

    // 同一条链：退役 → 撤销 → 再退役，旧锚 = 链尾新锚。
    expect((await retire(target, { reason: "导出服务改由 BaaS 承担" })).result.change).toBe("RETIRED");
    expect(advance("ADV-0002").old_anchor).toEqual(advance("ADV-0001").new_anchor);
    expect(advance("ADV-0003").old_anchor).toEqual(advance("ADV-0002").new_anchor);
    expect(ledger().entries).toHaveLength(2);
  });

  it("退役前从未确认过的目标：撤销后即使文件未变也判漂移（须 Owner 重确认）", async () => {
    expect((await runInit(dir, { platforms: "claude" })).ok).toBe(true);
    await fillKeys();
    const target = "baseline/data/lineage.md";
    expect((await retire(target)).result.change).toBe("RETIRED");
    expect((await runBaselineConfirm(dir)).result.change).toBe("CONFIRMED");
    expect((await unretire(target)).result.change).toBe("UNRETIRED");
    const read1 = await readBaselineConfirmation(dir);
    if (read1.kind !== "record-valid") throw new Error("expected record");
    expect(read1.mismatches.map((mismatch) => mismatch.target)).toEqual([target]);
  });

  it("非 human: 执行者 / 缺 --not-applicable / 未知目标 / 空理由被拒；重复退役与撤销未退役 = NO_CHANGE 零写入", async () => {
    await buildConfirmedProject();
    const target = "baseline/platform/delivery.md";
    const before = snapshot();
    expect((await retire(target, { by: "agent:claude" })).errors[0]?.code).toBe("SCHEMA_INVALID");
    expect((await retire(target, { notApplicable: false })).errors[0]?.code).toBe("SCHEMA_INVALID");
    expect((await retire("baseline/platform/nope.md")).errors[0]?.code).toBe("SCHEMA_INVALID");
    expect((await retire(target, { reason: " " })).errors[0]?.code).toBe("SCHEMA_INVALID");
    expect((await retire(target, { reason: "TODO" })).errors[0]?.message).toContain("placeholder");
    expect((await unretire(target)).result.change).toBe("NO_CHANGE");
    expect(snapshot()).toEqual(before);

    expect((await retire(target)).result.change).toBe("RETIRED");
    const afterRetire = snapshot();
    expect((await retire(target)).result.change).toBe("NO_CHANGE");
    expect(snapshot()).toEqual(afterRetire);
  });

  it("在途变更批里的目标不能退役（BASELINE_NOT_CONFIRMED，零写入）", async () => {
    await buildConfirmedProject();
    const store = await createStore(dir);
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "CHANGE.C0601",
            kind: "change_object",
            axisProfile: "change_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "前端框架变更",
            authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
            origin: "natural",
            payload: {
              motivation: "治理通路授权的基线修改",
              affected_objects: ["CAPABILITY.DEMO"],
              reopen_count: 0,
              class_scan_result: { scope: "src/shared/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-0001" },
            },
          } as never,
        },
      ],
    });
    expect((await runBaselineSet(dir, { lane: "frontend", key: "framework", value: "react", change: "CHANGE.C0601" })).ok).toBe(true);
    const before = snapshot();
    const outcome = await retire("baseline/frontend/stack.yaml");
    expect(outcome.errors[0]?.code).toBe("BASELINE_NOT_CONFIRMED");
    expect(outcome.errors[0]?.hint).toContain("--change CHANGE.C0601");
    expect(snapshot()).toEqual(before);
  });
});

describe("baseline retire × 任务范围（V2-6 × V2-7）", () => {
  async function seedTask(declaration: unknown): Promise<void> {
    const store = await createStore(dir);
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "TASK.T0601",
            kind: "task_object",
            axisProfile: "task_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "前端任务",
            authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
            origin: "natural",
            payload: {
              intent: "前端导出",
              baseline_dependencies: declaration,
              acceptance: [],
              class_scan_result: { scope: "src/shared/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-0001" },
            },
          } as never,
        },
      ],
    });
  }

  it("--lanes 与列全校验用有效目标；撤销退役后未覆盖该目标的声明判 MALFORMED，reassess 恢复", async () => {
    await buildConfirmedProject();
    const target = "baseline/data/model.md";
    expect((await retire(target)).result.change).toBe("RETIRED");
    const confirmation = await readBaselineConfirmation(dir);
    if (confirmation.kind !== "record-valid") throw new Error("expected record");
    const lanes = baselineTargetsForLanes(["frontend"], confirmation.retired);
    expect([...lanes.relevant, ...lanes.excluded]).not.toContain(target);
    const built = buildBaselineDependencyDeclaration(confirmation.record, lanes.relevant, lanes.excluded, confirmation.retired);
    if (!built.ok) throw new Error(built.details.join("; "));
    expect(buildBaselineDependencyDeclaration(confirmation.record, lanes.relevant, lanes.excluded).ok).toBe(false); // 不计退役 = 未覆盖
    await seedTask(built.declaration);
    expect((await baselineGateAssessment(dir, built.declaration)).errors).toEqual([]);

    const restored = await unretire(target);
    expect(restored.result.affected_tasks).toEqual(["TASK.T0601"]);
    expect(restored.human.join("\n")).toContain("pomaster task reassess-baseline TASK.T0601");
    expect((await baselineGateAssessment(dir, built.declaration)).errors.map((error) => error.code)).toEqual(["BASELINE_SCOPE_MALFORMED"]);

    const reassessed = await runTaskReassessBaseline(dir, { task: "TASK.T0601", lanes: ["frontend"], reason: "data 模型目标重新适用，重新划分范围", by: OWNER });
    expect(reassessed.errors).toEqual([]);
    expect(reassessed.result.excluded_targets).toContain(target);
    const declaration = await readTaskBaselineDependencies(dir, "TASK.T0601");
    expect((await baselineGateAssessment(dir, declaration as never)).errors).toEqual([]);
  });
});
