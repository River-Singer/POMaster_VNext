/**
 * brainstorm.spec.ts —— §44.3 brainstorm 三命令（P18）。
 *
 * 判据：
 * - start：创建 scratchpad（§80.3 原文路径 .pomaster/discovery/scratchpads/<id>/）并进入
 *   DISCOVERY 态；state.json = 08-discovery-state-chain 信封（ajv 校验钉形态）；--ephemeral
 *   登记 meta；同 id 重复 = NO_CHANGE 幂等；id 词形外/残缺目录显式拒绝。
 * - status：空目录显式空清单；条目呈现 state/ephemeral/promoted_ref；损坏 state.json 显式
 *   warning（不静默）。
 * - promote（提升面钉死）：非 READY_TO_PROMOTE 起点拒绝（DISCOVERY_TRANSITION_BLOCKED +
 *   kernel hint 透传）；--basis 词表外拒绝；缺省产出 maintain --ops tx 文件 + 指路、
 *   scratchpad 状态不动；--apply 经 runMaintain（P11 maintain 面字面复用）落库成功后才推进
 *   scratchpad 终态（08 信封 promoted_ref/promotion_basis）；**与显式 maintain --ops 直跑
 *   等价**（同通道判卷：两路 store 结果一致——不私造第二写入通道的直接证据）；
 *   **--tx-out 落点闸（P18 红队发现3）**：绝对路径出仓/相对 .. 逃逸/受治理面显式拒绝，
 *   仓内相对路径以 rootDir 为基准解析（非进程 CWD）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Ajv from "ajv";
import { allSchemas, discoveryStateChainSchema } from "@pomaster/schemas";
import type { DecisionNodeCandidate } from "@pomaster/kernel";
import {
  QUESTION_GATE_CATEGORIES,
} from "@pomaster/kernel";
import {
  runBrainstormDecide,
  runBrainstormPromote,
  runBrainstormQuestionGate,
  runBrainstormStart,
  runBrainstormStatus,
  runMaintain,
  type BrainstormDecideResult,
  type BrainstormPromoteResult,
  type BrainstormQuestionGateResult,
  type BrainstormStartResult,
  type BrainstormStatusResult,
} from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-brainstorm-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const ajv = new Ajv({ strictSchema: false, allErrors: true });
for (const schema of Object.values(allSchemas)) {
  ajv.addSchema(schema as Record<string, unknown>);
}
const validateChain = ajv.compile(discoveryStateChainSchema as object);

function scratchpadDir(id: string): string {
  return join(root, ".pomaster", "discovery", "scratchpads", id);
}

function stateFileOf(id: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(scratchpadDir(id), "state.json"), "utf8"),
  ) as Record<string, unknown>;
}

/**
 * 把 scratchpad 推到 READY_TO_PROMOTE（promote **组件语义**测试的夹具；形态与 CLI 写入侧
 * 一致）。审计 F3 修复后的边界注记：公开 DISCOVERY→READY_TO_PROMOTE 推进链已由
 * brainstorm decide 接线（正向链见本文件 decide describe 与 tests/integration/
 * fixture-discovery-chain.spec.ts——全程零手写 state.json）；本 helper 仅服务于与链无关
 * 的 promote 自身语义钉死（词表闸/tx 落点闸/等价性），不得用于任何「正向可达性」断言。
 */
async function seedReadyToPromote(id: string): Promise<void> {
  mkdirSync(scratchpadDir(id), { recursive: true });
  writeFileSync(
    join(scratchpadDir(id), "state.json"),
    `${JSON.stringify(
      {
        state: "READY_TO_PROMOTE",
        scratchpad_ref: `.pomaster/discovery/scratchpads/${id}/`,
        promotion_basis: "needs_formal_resources",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

describe("brainstorm start（§44.3 + §80.3 Ephemeral）", () => {
  it("创建 scratchpad 进入 DISCOVERY 态；state.json 满足 08 schema（ajv）；--ephemeral 登记可见", async () => {
    const outcome = await runBrainstormStart(root, {
      ephemeral: true,
      id: "idea-carline-import",
      title: "车系导入",
    });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as BrainstormStartResult;
    expect(result.change).toBe("CREATED");
    expect(result.state).toBe("DISCOVERY");
    expect(result.ephemeral).toBe(true);
    expect(result.scratchpad_ref).toBe(
      ".pomaster/discovery/scratchpads/idea-carline-import/",
    );
    // 08 信封形态（ajv 独立复核——CLI 写入侧不留侥幸）。
    const stateFile = stateFileOf("idea-carline-import") as Record<string, unknown>;
    expect(validateChain(stateFile)).toBe(true);
    // meta 注记（CLI 局部词文件）。
    const meta = JSON.parse(
      readFileSync(join(scratchpadDir("idea-carline-import"), "meta.json"), "utf8"),
    ) as { ephemeral: boolean; chain: string[]; title: string };
    expect(meta.ephemeral).toBe(true);
    expect(meta.chain).toEqual(["IDEA", "DISCOVERY"]);
    expect(meta.title).toBe("车系导入");
  });

  it("同 id 重复 start = NO_CHANGE（Ephemeral 驻留是合法状态，幂等优雅）", async () => {
    await runBrainstormStart(root, { id: "idea-a" });
    const outcome = await runBrainstormStart(root, { id: "idea-a" });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as BrainstormStartResult).change).toBe("NO_CHANGE");
  });

  it("id 词形外（大写外字符/空）显式拒绝（08 scratchpad_ref 目录段词形）", async () => {
    const outcome = await runBrainstormStart(root, { id: "含中文" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(existsSync(join(root, ".pomaster", "discovery"))).toBe(false);
  });

  it("残缺目录（存在但无 state.json）= SCRATCHPAD_INCOMPLETE（残缺幂等不是幂等）", async () => {
    mkdirSync(scratchpadDir("idea-broken"), { recursive: true });
    const outcome = await runBrainstormStart(root, { id: "idea-broken" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCRATCHPAD_INCOMPLETE");
  });

  it("缺省 id 自动编号（idea-001 起，占用跳过——确定性零墙钟）", async () => {
    const first = await runBrainstormStart(root, {});
    expect((first.result as BrainstormStartResult).discovery_id).toBe("idea-001");
    const second = await runBrainstormStart(root, {});
    expect((second.result as BrainstormStartResult).discovery_id).toBe("idea-002");
  });
});

describe("brainstorm status（§44.3）", () => {
  it("无 scratchpads 目录 = ok 空清单（显式空，Ephemeral 纪律下无 discovery 正常）", async () => {
    const outcome = await runBrainstormStatus(root);
    expect(outcome.ok).toBe(true);
    expect((outcome.result as BrainstormStatusResult).scratchpads).toEqual([]);
    expect(outcome.human.join()).toContain("无活跃 discovery");
  });

  it("呈现 state/ephemeral/promoted_ref；损坏 state.json 显式 warning 不静默", async () => {
    await runBrainstormStart(root, { id: "idea-ok", ephemeral: true });
    mkdirSync(scratchpadDir("idea-bad"), { recursive: true });
    writeFileSync(join(scratchpadDir("idea-bad"), "state.json"), "{not json", "utf8");
    const outcome = await runBrainstormStatus(root);
    expect(outcome.ok).toBe(true);
    const result = outcome.result as BrainstormStatusResult;
    expect(result.scratchpads).toHaveLength(2);
    const ok = result.scratchpads.find((s) => s.discovery_id === "idea-ok");
    expect(ok?.state).toBe("DISCOVERY");
    expect(ok?.ephemeral).toBe(true);
    expect(ok?.malformed).toBe(false);
    const bad = result.scratchpads.find((s) => s.discovery_id === "idea-bad");
    expect(bad?.malformed).toBe(true);
    expect(outcome.warnings.map((w) => w.code)).toContain("SCRATCHPAD_STATE_MALFORMED");
  });
});

describe("brainstorm promote（提升面：READY_TO_PROMOTE→CHANGE/TASK 走 P11 maintain 面）", () => {
  it("非 READY_TO_PROMOTE 起点（DISCOVERY 跳步提升）→ DISCOVERY_TRANSITION_BLOCKED + kernel hint（跳步不在矩阵）", async () => {
    await runBrainstormStart(root, { id: "idea-early" });
    const outcome = await runBrainstormPromote(root, {
      discoveryId: "idea-early",
      to: "TASK",
      basis: "user_explicit_request",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("DISCOVERY_TRANSITION_BLOCKED");
    expect(outcome.errors[0]?.hint).toContain("合法目标");
    expect(existsSync(join(scratchpadDir("idea-early"), "promote-tx.json"))).toBe(false);
  });

  it("--basis 词表外 → SCHEMA_INVALID + 四词形 hint（词表纪律）", async () => {
    await seedReadyToPromote("idea-rtp");
    const outcome = await runBrainstormPromote(root, {
      discoveryId: "idea-rtp",
      to: "TASK",
      basis: "BLOCKER",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.hint).toContain("needs_cross_session_tracking");
  });

  it("--to 词形外 → SCHEMA_INVALID（§80.3 终态只有 CHANGE/TASK）", async () => {
    await seedReadyToPromote("idea-rtp2");
    const outcome = await runBrainstormPromote(root, {
      discoveryId: "idea-rtp2",
      to: "EPIC",
      basis: "user_explicit_request",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("对抗（审查 H4）：discovery id 含 ../ 逃逸 → SCHEMA_INVALID 零落盘（与 start 同款词形闸，mkdir 越位封死）", async () => {
    await seedReadyToPromote("idea-legit");
    const outcome = await runBrainstormPromote(root, {
      discoveryId: "../idea-evil",
      to: "TASK",
      basis: "user_explicit_request",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("不匹配词形");
    // 零落盘：逃逸位（scratchpads 平面外）与 tx 文件都不存在，合法位不被波及。
    expect(existsSync(join(root, ".pomaster", "discovery", "idea-evil"))).toBe(false);
    expect(existsSync(join(scratchpadDir("idea-legit"), "promote-tx.json"))).toBe(false);
  });

  it("缺省（无 --apply）：产出 maintain --ops tx 文件 + 指路命令；scratchpad 状态不动（提升未落库）", async () => {
    await seedReadyToPromote("idea-txonly");
    const outcome = await runBrainstormPromote(root, {
      discoveryId: "idea-txonly",
      to: "TASK",
      basis: "msd_reached",
    });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as BrainstormPromoteResult;
    expect(result.applied).toBe(false);
    expect(result.suggested_command).toContain("pomaster maintain idea-txonly --ops");
    expect(result.suggested_command).toContain("promote-tx.json");
    expect(result.promoted_ref).toBe("TASK.IDEA_TXONLY");
    // scratchpad 状态不动（提升未完成）。
    expect(stateFileOf("idea-txonly").state).toBe("READY_TO_PROMOTE");
    // tx 文件是 maintain --ops 输入形态（ops[] + authorityRef + note）。
    const tx = JSON.parse(
      readFileSync(join(scratchpadDir("idea-txonly"), "promote-tx.json"), "utf8"),
    ) as { ops: { op: string }[]; authorityRef: string };
    expect(tx.ops[0]?.op).toBe("upsert_object");
    expect(tx.authorityRef).toBe("TASK.IDEA_TXONLY");
  });

  it("SEGMENT 派生失败（数字开头 id）→ 显式拒绝并指路 --as 具名", async () => {
    await seedReadyToPromote("2026-idea");
    const outcome = await runBrainstormPromote(root, {
      discoveryId: "2026-idea",
      to: "CHANGE",
      basis: "user_explicit_request",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.hint).toContain("--as");
  });

  it("--as 前缀与 --to 失配（--to TASK 但 --as CHANGE.X）→ SCHEMA_INVALID", async () => {
    await seedReadyToPromote("idea-mismatch");
    const outcome = await runBrainstormPromote(root, {
      discoveryId: "idea-mismatch",
      to: "TASK",
      basis: "user_explicit_request",
      asRef: "CHANGE.NOT_TASK",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.hint).toContain("前缀");
  });

  it("--apply 经 runMaintain（P11 面）落库：store 出现提升对象 + scratchpad 推进终态（08 信封）", async () => {
    // 先 init 出治理 store（BOOTSTRAP owner 骨架）。
    await runBrainstormStart(root, { id: "idea-apply" }); // store 无关，先建 scratchpad 无妨
    const { runInit } = await import("@pomaster/cli");
    await runInit(root);
    // 审计 F3 修复：READY 前置走公开 decide 推进链（零手写 state.json——组件级正向链）。
    const candidatesPath = join(root, "decide-candidates.json");
    writeFileSync(candidatesPath, `${JSON.stringify([decideCandidate("DECISION.APPLY_SCOPE")], null, 2)}\n`, "utf8");
    const set = await runBrainstormDecide(root, {
      discoveryId: "idea-apply",
      set: candidatesPath,
      retrieved: ["CURRENT_TRUTH"],
    });
    expect(set.ok).toBe(true);
    const answered = await runBrainstormDecide(root, {
      discoveryId: "idea-apply",
      answer: "DECISION.APPLY_SCOPE",
      accept: true,
    });
    expect(answered.ok).toBe(true);
    const ready = await runBrainstormDecide(root, {
      discoveryId: "idea-apply",
      ready: true,
      msdGoal: "true",
      msdScope: "true",
      msdAcceptance: "true",
    });
    expect(ready.ok).toBe(true);
    expect(stateFileOf("idea-apply").state).toBe("READY_TO_PROMOTE");
    const outcome = await runBrainstormPromote(root, {
      discoveryId: "idea-apply",
      to: "TASK",
      basis: "needs_cross_session_tracking",
      apply: true,
    });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as BrainstormPromoteResult;
    expect(result.applied).toBe(true);
    expect(result.maintain_change).toBe("APPLIED");
    expect(result.applied_seq).not.toBeNull();
    expect(result.promoted_ref).toBe("TASK.IDEA_APPLY");
    // scratchpad 终态（08 信封：终态带 basis + promoted_ref）。
    const stateFile = stateFileOf("idea-apply");
    expect(stateFile.state).toBe("TASK");
    expect(stateFile.promotion_basis).toBe("needs_cross_session_tracking");
    expect(stateFile.promoted_ref).toBe("TASK.IDEA_APPLY");
    expect(validateChain(stateFile)).toBe(true);
    // 治理 store 里出现提升对象（inspect 通路可读 = 走的是 store 事务）。
    const { runInspect } = await import("@pomaster/cli");
    const inspected = await runInspect(root, { id: "TASK.IDEA_APPLY" });
    expect(inspected.ok).toBe(true);
  });

  it("等价性钉死：promote --apply 与显式 maintain --ops 直跑产生同型 store 结果（同通道零旁移）", async () => {
    const { runInit } = await import("@pomaster/cli");
    await runInit(root);

    // 通道 A：promote --apply。
    await seedReadyToPromote("idea-via-a");
    const viaA = await runBrainstormPromote(root, {
      discoveryId: "idea-via-a",
      to: "TASK",
      basis: "user_explicit_request",
      apply: true,
      asRef: "TASK.VIA_A",
    });
    expect(viaA.ok).toBe(true);

    // 通道 B：同一 tx 文件交显式 maintain --ops。
    await seedReadyToPromote("idea-via-b");
    const viaBPrep = await runBrainstormPromote(root, {
      discoveryId: "idea-via-b",
      to: "TASK",
      basis: "user_explicit_request",
      asRef: "TASK.VIA_B",
    });
    expect(viaBPrep.ok).toBe(true);
    const txFile = join(scratchpadDir("idea-via-b"), "promote-tx.json");
    const viaB = await runMaintain(root, {
      changeOrTask: "idea-via-b",
      opsFile: txFile,
      authorityRef: "TASK.VIA_B",
      note: (JSON.parse(readFileSync(txFile, "utf8")) as { note: string }).note,
    });
    expect(viaB.ok).toBe(true);

    // 两通道产出同型对象（kind/axes/origin 逐键一致——唯一差别是溯源 ref 与 title）。
    const { runInspect } = await import("@pomaster/cli");
    const objA = (await runInspect(root, { id: "TASK.VIA_A" })).result as {
      kind: string;
      axes: Record<string, string>;
    };
    const objB = (await runInspect(root, { id: "TASK.VIA_B" })).result as {
      kind: string;
      axes: Record<string, string>;
    };
    expect(objA.kind).toBe(objB.kind);
    expect(objA.axes).toEqual(objB.axes);
  });

  it("store 未初始化时 --apply → maintain 面 NOT_INITIALIZED 透传（不私造初始化旁路）", async () => {
    await seedReadyToPromote("idea-nostore");
    const outcome = await runBrainstormPromote(root, {
      discoveryId: "idea-nostore",
      to: "TASK",
      basis: "user_explicit_request",
      apply: true,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
    // scratchpad 状态不推进（落库失败零状态变更）。
    expect(stateFileOf("idea-nostore").state).toBe("READY_TO_PROMOTE");
  });
});

describe("brainstorm promote --tx-out 落点闸（P18 红队发现3：强制解析进 rootDir）", () => {
  it("对抗：绝对路径出仓 → SCHEMA_INVALID，仓外零落盘", async () => {
    // 若防御失效：promote 把 maintain --ops 输入件写进仓库外任意位置（沙箱/治理树外逃逸）。
    await seedReadyToPromote("idea-tx-esc");
    const outside = join(root, "..", "pvnext-tx-escape-abs", "tx.json");
    const outcome = await runBrainstormPromote(root, {
      discoveryId: "idea-tx-esc",
      to: "TASK",
      basis: "msd_reached",
      txOut: outside,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("越出仓库根");
    expect(existsSync(outside)).toBe(false);
  });

  it("对抗：相对 .. 逃逸 → SCHEMA_INVALID（解析落点出仓即拒）", async () => {
    await seedReadyToPromote("idea-tx-dotdot");
    const outcome = await runBrainstormPromote(root, {
      discoveryId: "idea-tx-dotdot",
      to: "CHANGE",
      basis: "user_explicit_request",
      txOut: "../escape-tx.json",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("越出仓库根");
    expect(existsSync(join(root, "..", "escape-tx.json"))).toBe(false);
  });

  it("对抗：落点命中受治理面（.pomaster/state/）→ SCHEMA_INVALID（store 写入面不容旁路文件）", async () => {
    await seedReadyToPromote("idea-tx-gov");
    const outcome = await runBrainstormPromote(root, {
      discoveryId: "idea-tx-gov",
      to: "TASK",
      basis: "msd_reached",
      txOut: ".pomaster/state/promote-tx.json",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("受治理面");
    expect(existsSync(join(root, ".pomaster", "state", "promote-tx.json"))).toBe(false);
  });

  it("对抗（B1 大小写归一）：受治理面大小写变体（UPPERCASE/mixed）→ 全部 REJECT（NTFS 大小写不敏感语义）", async () => {
    // 若防御失效：Windows NTFS 大小写不敏感，`.POMASTER/state/...` 大小写变体绕过
    // 大小写敏感 denylist 后 writeFile 直接覆写 store 权威面（探针实锤：lowercase→
    // REJECT，UPPERCASE/mixed→ALLOW）。三变体逐一 REJECT 且零落盘。
    for (const [id, txOut] of [
      ["idea-tx-upper", ".POMASTER/state/promote-tx.json"],
      ["idea-tx-mixed", ".Pomaster/State/promote-tx.json"],
      ["idea-tx-dot-upper", ".POMASTER/STATE/truth-index.json"],
    ] as const) {
      await seedReadyToPromote(id);
      const outcome = await runBrainstormPromote(root, {
        discoveryId: id,
        to: "TASK",
        basis: "msd_reached",
        txOut,
      });
      expect(outcome.ok, `txOut=${txOut} 应 REJECT`).toBe(false);
      expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
      expect(outcome.errors[0]?.message).toContain("受治理面");
      expect(existsSync(join(root, txOut))).toBe(false);
    }
  });

  it("对抗（B1 denylist 缺口补齐）：kernel 唯一写通道平面（executions/runtime/traces）→ REJECT", async () => {
    // 若防御失效：denylist 只覆盖 state/truth/objects/policies/evidence 五面，
    // .pomaster/runtime/locks/change-CHG.1.lock 之类运行时面路径 ALLOW 旁路落盘
    // （探针实锤）。三平面（含 runtime 子目录）逐一 REJECT 且零落盘。
    for (const [id, segments] of [
      ["idea-tx-exec", [".pomaster", "executions", "promote-tx.json"]],
      ["idea-tx-locks", [".pomaster", "runtime", "locks", "change-CHG.1.lock"]],
      ["idea-tx-trace", [".pomaster", "traces", "AGX-1.json"]],
    ] as const) {
      await seedReadyToPromote(id);
      const outcome = await runBrainstormPromote(root, {
        discoveryId: id,
        to: "TASK",
        basis: "msd_reached",
        txOut: segments.join("/"),
      });
      expect(outcome.ok, `txOut=${segments.join("/")} 应 REJECT`).toBe(false);
      expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
      expect(outcome.errors[0]?.message).toContain("受治理面");
      expect(existsSync(join(root, ...segments))).toBe(false);
    }
  });

  it("非恒真对照：仓内相对路径 → 以 rootDir 为基准落盘成功（不以进程 CWD 为准）", async () => {
    await seedReadyToPromote("idea-tx-rel");
    const outcome = await runBrainstormPromote(root, {
      discoveryId: "idea-tx-rel",
      to: "TASK",
      basis: "needs_formal_resources",
      txOut: "tx-custom-rel.json",
    });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as BrainstormPromoteResult;
    const landed = join(root, "tx-custom-rel.json");
    expect(existsSync(landed)).toBe(true);
    expect(result.tx_file.endsWith("tx-custom-rel.json")).toBe(true);
    expect(result.suggested_command).toContain("tx-custom-rel.json");
    const tx = JSON.parse(readFileSync(landed, "utf8")) as { ops: { op: string }[] };
    expect(tx.ops[0]?.op).toBe("upsert_object");
  });
});

// ============================================================
// question-gate（§80.4 产品消费面；09-04 Batch 1 R2/D1+C1）
// ============================================================

describe("brainstorm question-gate（kernel evaluateQuestionGate 消费面；判卷零旁移）", () => {
  /** 七关申报基线：Q1-Q6 不命中 + Q7 阻塞。 */
  const BASE_FLAGS = {
    q1: "false",
    q2: "false",
    q3: "false",
    q4: "false",
    q5: "false",
    q6: "false",
    q7: "true",
  } as const;

  it("start --prompt 登记 raw prompt + Intent Framing 四分拣（§4A 入口载体——§31 CRC-A 零载体层补齐）", async () => {
    const outcome = await runBrainstormStart(root, {
      id: "idea-payment-oneliner",
      prompt: "帮我做一个支付系统",
      framing: {
        known: ["需要订单创建"],
        unknown: ["用哪个支付 provider"],
        conflict: [],
        assumption: ["用户会自行配置 API key"],
      },
    });
    expect(outcome.ok).toBe(true);
    const meta = JSON.parse(
      readFileSync(join(scratchpadDir("idea-payment-oneliner"), "meta.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(meta["prompt"]).toBe("帮我做一个支付系统");
    expect(meta["framing"]).toEqual({
      known: ["需要订单创建"],
      unknown: ["用哪个支付 provider"],
      conflict: [],
      assumption: ["用户会自行配置 API key"],
    });
  });

  it("start 无 prompt → meta 无 prompt/framing 键（既有调用方零行为变更）", async () => {
    await runBrainstormStart(root, { id: "idea-plain" });
    const meta = JSON.parse(
      readFileSync(join(scratchpadDir("idea-plain"), "meta.json"), "utf8"),
    ) as Record<string, unknown>;
    expect("prompt" in meta).toBe(false);
    expect("framing" in meta).toBe(false);
  });

  it("ASK_HUMAN：七关全过 + BLOCKING_AUTHORITY → may_ask_human（一次一问路标在场）", async () => {
    await runBrainstormStart(root, { id: "idea-ask" });
    const outcome = await runBrainstormQuestionGate(root, {
      discoveryId: "idea-ask",
      category: "BLOCKING_AUTHORITY",
      ...BASE_FLAGS,
    });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as BrainstormQuestionGateResult;
    expect(result.verdict).toBe("ASK_HUMAN");
    expect(result.may_ask_human).toBe(true);
    expect(outcome.human.join("\n")).toContain("One-question-at-a-time");
  });

  it("DERIVABLE：Q3 命中 → 处置 DERIVABLE@Q3（判卷以七关重算为准）", async () => {
    await runBrainstormStart(root, { id: "idea-deriv" });
    const outcome = await runBrainstormQuestionGate(root, {
      discoveryId: "idea-deriv",
      category: "BLOCKING_AUTHORITY",
      ...BASE_FLAGS,
      q3: "true",
    });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as BrainstormQuestionGateResult;
    expect(result.verdict).toBe("DERIVABLE");
    expect(result.stopped_at_gate).toBe("Q3");
    expect(result.declared_consistent).toBe(false);
  });

  it("DEFERABLE：q7=false 无 assume → DEFERABLE（缺省零行为变更）", async () => {
    await runBrainstormStart(root, { id: "idea-defer" });
    const outcome = await runBrainstormQuestionGate(root, {
      discoveryId: "idea-defer",
      category: "DEFERABLE",
      ...BASE_FLAGS,
      q7: "false",
    });
    const result = outcome.result as BrainstormQuestionGateResult;
    expect(result.verdict).toBe("DEFERABLE");
  });

  it("ASSUMPTION：q7=false + 五条件全 --assume → ASSUMPTION + §49.2 登记指路（Owner 裁定 C1）", async () => {
    await runBrainstormStart(root, { id: "idea-assume" });
    const outcome = await runBrainstormQuestionGate(root, {
      discoveryId: "idea-assume",
      category: "DEFERABLE",
      ...BASE_FLAGS,
      q7: "false",
      assume: [
        "low_risk",
        "reversible",
        "within_permit",
        "no_authority_conflict",
        "acceptance_testable",
      ],
    });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as BrainstormQuestionGateResult;
    expect(result.verdict).toBe("ASSUMPTION");
    expect(outcome.human.join("\n")).toContain("--classification ASSUMPTION");
    expect(outcome.human.join("\n")).toContain("同词两轴");
  });

  it("ASSUMPTION 缺一条件（只申报四条件）→ DEFERABLE（禁缺省放行）", async () => {
    await runBrainstormStart(root, { id: "idea-partial" });
    const outcome = await runBrainstormQuestionGate(root, {
      discoveryId: "idea-partial",
      category: "DEFERABLE",
      ...BASE_FLAGS,
      q7: "false",
      assume: ["low_risk", "reversible", "within_permit", "no_authority_conflict"],
    });
    const result = outcome.result as BrainstormQuestionGateResult;
    expect(result.verdict).toBe("DEFERABLE");
  });

  it("ASK_REJECTED fail-closed：七关全过 + DEFERABLE 申报 → ok=false + ASK_REJECTED 码位", async () => {
    await runBrainstormStart(root, { id: "idea-reject" });
    const outcome = await runBrainstormQuestionGate(root, {
      discoveryId: "idea-reject",
      category: "DEFERABLE",
      ...BASE_FLAGS,
    });
    expect(outcome.ok).toBe(false);
    const result = outcome.result as BrainstormQuestionGateResult;
    expect(result.verdict).toBe("ASK_REJECTED");
    expect(outcome.errors[0]?.code).toBe("ASK_REJECTED");
  });

  it("fail-closed 闸：id 词形外 / scratchpad 不在册 / category 词表外（ASSUMPTION 是处置位非申报位）/ 七关缺位 / 词形外 / assume 词表外", async () => {
    const badId = await runBrainstormQuestionGate(root, {
      discoveryId: "../escape",
      category: "BLOCKING_AUTHORITY",
      ...BASE_FLAGS,
    });
    expect(badId.ok).toBe(false);
    expect(badId.errors[0]?.code).toBe("SCHEMA_INVALID");

    const notFound = await runBrainstormQuestionGate(root, {
      discoveryId: "idea-ghost",
      category: "BLOCKING_AUTHORITY",
      ...BASE_FLAGS,
    });
    expect(notFound.ok).toBe(false);
    expect(notFound.errors[0]?.code).toBe("SCRATCHPAD_NOT_FOUND");

    await runBrainstormStart(root, { id: "idea-badcat" });
    const badCategory = await runBrainstormQuestionGate(root, {
      discoveryId: "idea-badcat",
      category: "ASSUMPTION",
      ...BASE_FLAGS,
    });
    expect(badCategory.ok).toBe(false);
    expect(badCategory.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(badCategory.errors[0]?.message).toContain("--category");
    expect(QUESTION_GATE_CATEGORIES).not.toContain("ASSUMPTION");

    const missingGate = await runBrainstormQuestionGate(root, {
      discoveryId: "idea-badcat",
      category: "BLOCKING_AUTHORITY",
      q1: "false",
      q2: "false",
      q3: "false",
      q5: "false",
      q6: "false",
      q7: "true",
    } as unknown as Parameters<typeof runBrainstormQuestionGate>[1]);
    expect(missingGate.ok).toBe(false);
    expect((missingGate.result as BrainstormQuestionGateResult).reason).toBe("input_invalid");

    const badFlag = await runBrainstormQuestionGate(root, {
      discoveryId: "idea-badcat",
      category: "BLOCKING_AUTHORITY",
      ...BASE_FLAGS,
      q1: "maybe",
    });
    expect(badFlag.ok).toBe(false);
    expect(badFlag.errors[0]?.message).toContain("true|false");
    // 旗标名镜像真实 CLI 面（--q1..--q7），不派生出 --q1currenttruth 幻影词形。
    expect(badFlag.errors[0]?.message).toContain("--q1 ");

    const badAssume = await runBrainstormQuestionGate(root, {
      discoveryId: "idea-badcat",
      category: "DEFERABLE",
      ...BASE_FLAGS,
      q7: "false",
      assume: ["low_risk", "risk_score"],
    });
    expect(badAssume.ok).toBe(false);
    expect(badAssume.errors[0]?.message).toContain("--assume");
  });
});

// ============================================================
// brainstorm decide（审计 F3 修复：DISCOVERY→READY_TO_PROMOTE 公开推进链；
// 判卷全部复用 kernel decision-graph 纯函数——本面只测接线，不测判卷语义）
// ============================================================

/** §5.2 十键候选节点夹具（schema 18 正例词形；grounding 十键全显式、missing_facts 显式空）。 */
function decideCandidate(id: string, dependsOn: readonly string[] = []): DecisionNodeCandidate {
  return {
    decision_id: id,
    class: "SCOPE",
    prompt: `${id} 是否纳入当前 Increment？`,
    depends_on: [...dependsOn],
    affects: [],
    grounding: {
      intent_refs: ["DISCOVERY.INTENT.001"],
      truth_refs: ["baseline/frontend/stack.yaml"],
      contract_refs: [],
      architecture_refs: [],
      implementation_refs: [],
      evidence_refs: [],
      knowledge_refs: [],
      research_finding_refs: [],
      conflicts: [],
      missing_facts: [],
    },
    options: ["INCLUDE_CURRENT_INCREMENT", "DEFER"],
    recommendation: {
      option: "INCLUDE_CURRENT_INCREMENT",
      basis_refs: ["baseline/frontend/stack.yaml"],
      rationale: "Current Truth 已登记清单页需求。",
      tradeoff: "先锁最小范围，延后项走 DEFER。",
      uncertainty: "范围若在实现期失效需重开本决策。",
      source: "PROJECT_GROUNDED",
    },
    authority: { owner: "BOOTSTRAP_OWNER" },
  };
}

function writeCandidatesFile(path: string, candidates: readonly DecisionNodeCandidate[]): void {
  writeFileSync(path, `${JSON.stringify(candidates, null, 2)}\n`, "utf8");
}

describe("brainstorm decide（F3 公开推进链：start → decide 三子动作 → READY_TO_PROMOTE，零预写 state.json）", () => {
  const READY_ARGS = {
    ready: true,
    msdGoal: "true",
    msdScope: "true",
    msdAcceptance: "true",
  } as const;

  it("公开正向链：--set 建图（verdict/frontier 呈现）→ --answer --accept → --ready 全绿 → READY_TO_PROMOTE（08 信封 + meta 链）→ promote --apply 落库", async () => {
    await runBrainstormStart(root, { id: "idea-chain" });
    const candidatesPath = join(root, "c-chain.json");
    writeCandidatesFile(candidatesPath, [decideCandidate("DECISION.CHAIN_SCOPE")]);

    const set = await runBrainstormDecide(root, {
      discoveryId: "idea-chain",
      set: candidatesPath,
      retrieved: ["CURRENT_TRUTH", "REPO"],
    });
    expect(set.ok).toBe(true);
    const setResult = set.result as BrainstormDecideResult;
    expect(setResult.change).toBe("CREATED");
    expect(setResult.state).toBe("DISCOVERY");
    expect(setResult.verdicts[0]).toMatchObject({
      decision_id: "DECISION.CHAIN_SCOPE",
      verdict: "READY_FOR_DECISION",
      failed_check: null,
      in_frontier: true,
      answerable: true,
    });
    // 图 sidecar（schema 18 形态：build 产物全 OPEN；resolution 只经 --answer 写入）。
    const graphOnDisk = JSON.parse(
      readFileSync(join(scratchpadDir("idea-chain"), "decision-graph.json"), "utf8"),
    ) as { decisions: { resolution: unknown }[]; graph_fingerprint: string };
    expect(graphOnDisk.decisions).toHaveLength(1);
    expect(graphOnDisk.decisions[0]?.resolution).toBeNull();
    expect(graphOnDisk.graph_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    // 判卷输入申报同拍落盘（G2/G6 重算输入）。
    const inputsOnDisk = JSON.parse(
      readFileSync(join(scratchpadDir("idea-chain"), "decision-inputs.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(inputsOnDisk["retrieved_surfaces"]).toEqual(["CURRENT_TRUTH", "REPO"]);

    const answered = await runBrainstormDecide(root, {
      discoveryId: "idea-chain",
      answer: "DECISION.CHAIN_SCOPE",
      accept: true,
    });
    expect(answered.ok).toBe(true);
    expect((answered.result as BrainstormDecideResult).answer_changed).toBe(true);

    const ready = await runBrainstormDecide(root, { discoveryId: "idea-chain", ...READY_ARGS });
    expect(ready.ok).toBe(true);
    const readyResult = ready.result as BrainstormDecideResult;
    expect(readyResult.change).toBe("PROMOTABLE");
    expect(readyResult.state).toBe("READY_TO_PROMOTE");
    expect(readyResult.promotion_basis).toBe("msd_reached");
    // 08 信封（ajv 独立复核）+ meta 链推进。
    const stateFile = stateFileOf("idea-chain");
    expect(stateFile).toMatchObject({
      state: "READY_TO_PROMOTE",
      scratchpad_ref: ".pomaster/discovery/scratchpads/idea-chain/",
      promotion_basis: "msd_reached",
    });
    expect(validateChain(stateFile)).toBe(true);
    const meta = JSON.parse(
      readFileSync(join(scratchpadDir("idea-chain"), "meta.json"), "utf8"),
    ) as { chain: string[] };
    expect(meta.chain).toEqual(["IDEA", "DISCOVERY", "READY_TO_PROMOTE"]);
    // 全链落库：promote --apply（零手写 state.json 的正向链终点 = 治理 store 出现 TASK）。
    const { runInit, runInspect } = await import("@pomaster/cli");
    await runInit(root);
    const promote = await runBrainstormPromote(root, {
      discoveryId: "idea-chain",
      to: "TASK",
      basis: "msd_reached",
      apply: true,
    });
    expect(promote.ok).toBe(true);
    expect((promote.result as BrainstormPromoteResult).applied).toBe(true);
    expect(stateFileOf("idea-chain").state).toBe("TASK");
    expect((await runInspect(root, { id: "TASK.IDEA_CHAIN" })).ok).toBe(true);
  });

  it("判定不足 fail-closed：OPEN 未决议 → --ready 拒 DECISION_SUFFICIENCY_BLOCKED，状态仍 DISCOVERY，缺口逐条可读", async () => {
    await runBrainstormStart(root, { id: "idea-insuff" });
    const candidatesPath = join(root, "c-insuff.json");
    writeCandidatesFile(candidatesPath, [decideCandidate("DECISION.INSUFF_SCOPE")]);
    await runBrainstormDecide(root, {
      discoveryId: "idea-insuff",
      set: candidatesPath,
      retrieved: ["REPO"],
    });
    const ready = await runBrainstormDecide(root, { discoveryId: "idea-insuff", ...READY_ARGS });
    expect(ready.ok).toBe(false);
    expect(ready.errors[0]?.code).toBe("DECISION_SUFFICIENCY_BLOCKED");
    const result = ready.result as BrainstormDecideResult;
    expect(result.sufficient).toBe(false);
    expect(result.state).toBe("DISCOVERY");
    expect(result.blocking.some((b) => b.decision_id === "DECISION.INSUFF_SCOPE")).toBe(true);
    expect(ready.human.join("\n")).toContain("OPEN decision");
    expect(ready.human.join("\n")).toContain("状态未变更");
    // 磁盘状态零变更（fail-closed——判定不足不推进）。
    expect(stateFileOf("idea-insuff").state).toBe("DISCOVERY");
  });

  it("MSD 未达成入缺口：决议齐但三轴任一 false → blocking 携带缺失轴名（09 msd_assessment 判据面）", async () => {
    await runBrainstormStart(root, { id: "idea-msd" });
    const candidatesPath = join(root, "c-msd.json");
    writeCandidatesFile(candidatesPath, [decideCandidate("DECISION.MSD_SCOPE")]);
    await runBrainstormDecide(root, { discoveryId: "idea-msd", set: candidatesPath, retrieved: ["REPO"] });
    await runBrainstormDecide(root, {
      discoveryId: "idea-msd",
      answer: "DECISION.MSD_SCOPE",
      accept: true,
    });
    const ready = await runBrainstormDecide(root, {
      discoveryId: "idea-msd",
      ready: true,
      msdGoal: "true",
      msdScope: "true",
      msdAcceptance: "false",
    });
    expect(ready.ok).toBe(false);
    expect(ready.errors[0]?.code).toBe("DECISION_SUFFICIENCY_BLOCKED");
    const result = ready.result as BrainstormDecideResult;
    expect(result.sufficient).toBe(false);
    expect(
      result.blocking.some((b) => b.detail.includes("acceptance_verifiable")),
    ).toBe(true);
    expect(stateFileOf("idea-msd").state).toBe("DISCOVERY");
  });

  it("MSD 三轴缺位/词形外 → SCHEMA_INVALID（缺判卷输入绝不静默当 false）", async () => {
    await runBrainstormStart(root, { id: "idea-msd-missing" });
    const candidatesPath = join(root, "c-msd-missing.json");
    writeCandidatesFile(candidatesPath, [decideCandidate("DECISION.MSD_MISSING")]);
    await runBrainstormDecide(root, {
      discoveryId: "idea-msd-missing",
      set: candidatesPath,
      retrieved: ["REPO"],
    });
    const missing = await runBrainstormDecide(root, {
      discoveryId: "idea-msd-missing",
      ready: true,
      msdGoal: "true",
      msdScope: "true",
    } as unknown as Parameters<typeof runBrainstormDecide>[1]);
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(missing.errors[0]?.message).toContain("--msd-acceptance");

    const badForm = await runBrainstormDecide(root, {
      discoveryId: "idea-msd-missing",
      ready: true,
      msdGoal: "yes",
      msdScope: "true",
      msdAcceptance: "true",
    });
    expect(badForm.ok).toBe(false);
    expect(badForm.errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("answer 前置闸（§6.2）：零检索面申报 → GROUNDING_NOT_READY（INSUFFICIENT_GROUNDING failed=G2），state 不变", async () => {
    await runBrainstormStart(root, { id: "idea-g2" });
    const candidatesPath = join(root, "c-g2.json");
    writeCandidatesFile(candidatesPath, [decideCandidate("DECISION.G2_SCOPE")]);
    // --set 不带 --retrieved：G2 判卷输入显式空（未检索现实）。
    const set = await runBrainstormDecide(root, { discoveryId: "idea-g2", set: candidatesPath });
    expect(set.ok).toBe(true);
    expect((set.result as BrainstormDecideResult).verdicts[0]).toMatchObject({
      verdict: "INSUFFICIENT_GROUNDING",
      failed_check: "G2",
      answerable: false,
    });
    const answered = await runBrainstormDecide(root, {
      discoveryId: "idea-g2",
      answer: "DECISION.G2_SCOPE",
      accept: true,
    });
    expect(answered.ok).toBe(false);
    expect(answered.errors[0]?.code).toBe("GROUNDING_NOT_READY");
    expect(answered.human.join("\n")).toContain("G2");
    expect(stateFileOf("idea-g2").state).toBe("DISCOVERY");
    // OPEN 节点 grounding 未过 → --ready 同样被复核闸拦（先于 sufficiency）。
    const ready = await runBrainstormDecide(root, { discoveryId: "idea-g2", ...READY_ARGS });
    expect(ready.ok).toBe(false);
    expect(ready.errors[0]?.code).toBe("GROUNDING_NOT_READY");
    expect(stateFileOf("idea-g2").state).toBe("DISCOVERY");
  });

  it("answer UNKNOWN 六问：can_safely_assume=true → ASSUMPTION 分类；重放幂等 NO_CHANGE", async () => {
    await runBrainstormStart(root, { id: "idea-unknown" });
    const candidatesPath = join(root, "c-unknown.json");
    writeCandidatesFile(candidatesPath, [decideCandidate("DECISION.UNKNOWN_SCOPE")]);
    await runBrainstormDecide(root, {
      discoveryId: "idea-unknown",
      set: candidatesPath,
      retrieved: ["CURRENT_TRUTH"],
    });
    const answered = await runBrainstormDecide(root, {
      discoveryId: "idea-unknown",
      answer: "DECISION.UNKNOWN_SCOPE",
      unknown: true,
      triage: [
        "can_derive=false",
        "can_research=false",
        "can_safely_assume=true",
        "can_defer=false",
        "can_prototype_observe=false",
        "blocks_current_increment=false",
      ],
    });
    expect(answered.ok).toBe(true);
    expect(answered.human.join("\n")).toContain("ASSUMPTION");
    // 同决议重放 = NO_CHANGE（kernel 幂等透传）。
    const replay = await runBrainstormDecide(root, {
      discoveryId: "idea-unknown",
      answer: "DECISION.UNKNOWN_SCOPE",
      unknown: true,
      triage: [
        "can_derive=false",
        "can_research=false",
        "can_safely_assume=true",
        "can_defer=false",
        "can_prototype_observe=false",
        "blocks_current_increment=false",
      ],
    });
    expect(replay.ok).toBe(true);
    expect((replay.result as BrainstormDecideResult).answer_changed).toBe(false);
    expect((replay.result as BrainstormDecideResult).change).toBe("NO_CHANGE");
    // UNKNOWN→ASSUMPTION 是 §15 合法停靠桶：决议后 --ready 可全绿。
    const ready = await runBrainstormDecide(root, { discoveryId: "idea-unknown", ...READY_ARGS });
    expect(ready.ok).toBe(true);
    expect(stateFileOf("idea-unknown").state).toBe("READY_TO_PROMOTE");
  });

  it("UNKNOWN 六问缺位/值形外/矛盾申报 → SCHEMA_INVALID 或 kernel 拒透传（不静默当 false）", async () => {
    await runBrainstormStart(root, { id: "idea-triage" });
    const candidatesPath = join(root, "c-triage.json");
    writeCandidatesFile(candidatesPath, [decideCandidate("DECISION.TRIAGE_SCOPE")]);
    await runBrainstormDecide(root, {
      discoveryId: "idea-triage",
      set: candidatesPath,
      retrieved: ["CURRENT_TRUTH"],
    });
    const missingKey = await runBrainstormDecide(root, {
      discoveryId: "idea-triage",
      answer: "DECISION.TRIAGE_SCOPE",
      unknown: true,
      triage: ["can_derive=false"],
    });
    expect(missingKey.ok).toBe(false);
    expect(missingKey.errors[0]?.code).toBe("SCHEMA_INVALID");

    const badValue = await runBrainstormDecide(root, {
      discoveryId: "idea-triage",
      answer: "DECISION.TRIAGE_SCOPE",
      unknown: true,
      triage: ["can_derive=maybe", "can_research=false", "can_safely_assume=false", "can_defer=false", "can_prototype_observe=false", "blocks_current_increment=false"],
    });
    expect(badValue.ok).toBe(false);
    expect(badValue.errors[0]?.code).toBe("SCHEMA_INVALID");

    // 六问全 no 且 blocks=false（矛盾申报）→ kernel unknown_triage_contradictory 透传。
    const contradictory = await runBrainstormDecide(root, {
      discoveryId: "idea-triage",
      answer: "DECISION.TRIAGE_SCOPE",
      unknown: true,
      triage: ["can_derive=false", "can_research=false", "can_safely_assume=false", "can_defer=false", "can_prototype_observe=false", "blocks_current_increment=false"],
    });
    expect(contradictory.ok).toBe(false);
    expect(contradictory.errors[0]?.code).toBe("DECISION_RESOLVE_UNKNOWN_TRIAGE_CONTRADICTORY");

    // --triage 错位（无 --unknown）→ SCHEMA_INVALID。
    const misplaced = await runBrainstormDecide(root, {
      discoveryId: "idea-triage",
      answer: "DECISION.TRIAGE_SCOPE",
      accept: true,
      triage: ["can_derive=true", "can_research=false", "can_safely_assume=false", "can_defer=false", "can_prototype_observe=false", "blocks_current_increment=false"],
    });
    expect(misplaced.ok).toBe(false);
    expect(misplaced.errors[0]?.message).toContain("--triage");
  });

  it("answer CHANGE（人工新 option）落图；答面四通道缺位/多给 → SCHEMA_INVALID", async () => {
    await runBrainstormStart(root, { id: "idea-change" });
    const candidatesPath = join(root, "c-change.json");
    writeCandidatesFile(candidatesPath, [decideCandidate("DECISION.CHANGE_SCOPE")]);
    await runBrainstormDecide(root, {
      discoveryId: "idea-change",
      set: candidatesPath,
      retrieved: ["CURRENT_TRUTH"],
    });
    const bothChannels = await runBrainstormDecide(root, {
      discoveryId: "idea-change",
      answer: "DECISION.CHANGE_SCOPE",
      accept: true,
      value: "SCOPE_NARROWED",
    });
    expect(bothChannels.ok).toBe(false);
    expect(bothChannels.errors[0]?.code).toBe("SCHEMA_INVALID");

    const noChannel = await runBrainstormDecide(root, {
      discoveryId: "idea-change",
      answer: "DECISION.CHANGE_SCOPE",
    } as unknown as Parameters<typeof runBrainstormDecide>[1]);
    expect(noChannel.ok).toBe(false);
    expect(noChannel.errors[0]?.code).toBe("SCHEMA_INVALID");

    const changed = await runBrainstormDecide(root, {
      discoveryId: "idea-change",
      answer: "DECISION.CHANGE_SCOPE",
      value: "SCOPE_NARROWED",
    });
    expect(changed.ok).toBe(true);
    const graph = JSON.parse(
      readFileSync(join(scratchpadDir("idea-change"), "decision-graph.json"), "utf8"),
    ) as { decisions: { decision_id: string; resolution: { answer: string; value?: string } | null }[] };
    expect(graph.decisions[0]?.resolution).toMatchObject({ answer: "CHANGE", value: "SCOPE_NARROWED" });
  });

  it("--set 重置闸：含决议的图重建 → DECISION_GRAPH_RESET_BLOCKED（重开须显式人工确认）", async () => {
    await runBrainstormStart(root, { id: "idea-reset" });
    const candidatesPath = join(root, "c-reset.json");
    writeCandidatesFile(candidatesPath, [decideCandidate("DECISION.RESET_SCOPE")]);
    await runBrainstormDecide(root, { discoveryId: "idea-reset", set: candidatesPath, retrieved: ["REPO"] });
    await runBrainstormDecide(root, { discoveryId: "idea-reset", answer: "DECISION.RESET_SCOPE", accept: true });
    const reset = await runBrainstormDecide(root, { discoveryId: "idea-reset", set: candidatesPath });
    expect(reset.ok).toBe(false);
    expect(reset.errors[0]?.code).toBe("DECISION_GRAPH_RESET_BLOCKED");
  });

  it("收敛后 decide 态闸 → DECIDE_REQUIRES_DISCOVERY（READY 态指路 promote；终态指路治理面）", async () => {
    await runBrainstormStart(root, { id: "idea-gate" });
    const candidatesPath = join(root, "c-gate.json");
    writeCandidatesFile(candidatesPath, [decideCandidate("DECISION.GATE_SCOPE")]);
    await runBrainstormDecide(root, { discoveryId: "idea-gate", set: candidatesPath, retrieved: ["REPO"] });
    await runBrainstormDecide(root, { discoveryId: "idea-gate", answer: "DECISION.GATE_SCOPE", accept: true });
    await runBrainstormDecide(root, { discoveryId: "idea-gate", ...READY_ARGS });
    const after = await runBrainstormDecide(root, {
      discoveryId: "idea-gate",
      answer: "DECISION.GATE_SCOPE",
      accept: true,
    });
    expect(after.ok).toBe(false);
    expect(after.errors[0]?.code).toBe("DECIDE_REQUIRES_DISCOVERY");
    expect(after.errors[0]?.hint).toContain("brainstorm promote");
  });

  it("kernel 判卷透传：候选依赖环 → DECISION_GRAPH_DEPENDENCY_CYCLE；目标不在图内 → DECISION_NOT_FOUND", async () => {
    await runBrainstormStart(root, { id: "idea-cycle" });
    const candidatesPath = join(root, "c-cycle.json");
    writeCandidatesFile(candidatesPath, [
      decideCandidate("DECISION.CYC_A", ["DECISION.CYC_B"]),
      decideCandidate("DECISION.CYC_B", ["DECISION.CYC_A"]),
    ]);
    const set = await runBrainstormDecide(root, { discoveryId: "idea-cycle", set: candidatesPath });
    expect(set.ok).toBe(false);
    expect(set.errors[0]?.code).toBe("DECISION_GRAPH_DEPENDENCY_CYCLE");

    const candidates2Path = join(root, "c-ok.json");
    writeCandidatesFile(candidates2Path, [decideCandidate("DECISION.OK_SCOPE")]);
    await runBrainstormDecide(root, { discoveryId: "idea-cycle", set: candidates2Path, retrieved: ["REPO"] });
    const notFound = await runBrainstormDecide(root, {
      discoveryId: "idea-cycle",
      answer: "DECISION.GHOST",
      accept: true,
    });
    expect(notFound.ok).toBe(false);
    expect(notFound.errors[0]?.code).toBe("DECISION_NOT_FOUND");
  });

  it("fail-closed 闸：子动作缺位/多给、scratchpad 不在册、图缺席、id 词形外、--set 文件不可读", async () => {
    const noAction = await runBrainstormDecide(root, { discoveryId: "idea-any" });
    expect(noAction.ok).toBe(false);
    expect(noAction.errors[0]?.code).toBe("SCHEMA_INVALID");

    const twoActions = await runBrainstormDecide(root, {
      discoveryId: "idea-any",
      ready: true,
      answer: "DECISION.X",
    });
    expect(twoActions.ok).toBe(false);
    expect(twoActions.errors[0]?.code).toBe("SCHEMA_INVALID");

    const ghost = await runBrainstormDecide(root, { discoveryId: "idea-ghost", ready: true, msdGoal: "true", msdScope: "true", msdAcceptance: "true" });
    expect(ghost.ok).toBe(false);
    expect(ghost.errors[0]?.code).toBe("SCRATCHPAD_NOT_FOUND");

    await runBrainstormStart(root, { id: "idea-nograph" });
    const noGraph = await runBrainstormDecide(root, {
      discoveryId: "idea-nograph",
      answer: "DECISION.ANY",
      accept: true,
    });
    expect(noGraph.ok).toBe(false);
    expect(noGraph.errors[0]?.code).toBe("DECISION_GRAPH_NOT_FOUND");

    const badId = await runBrainstormDecide(root, { discoveryId: "../escape", ready: true });
    expect(badId.ok).toBe(false);
    expect(badId.errors[0]?.code).toBe("SCHEMA_INVALID");

    const unreadable = await runBrainstormDecide(root, {
      discoveryId: "idea-nograph",
      set: join(root, "no-such-candidates.json"),
    });
    expect(unreadable.ok).toBe(false);
    expect(unreadable.errors[0]?.code).toBe("IO_ERROR");
  });
});
