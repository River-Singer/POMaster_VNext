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
import {
  runBrainstormPromote,
  runBrainstormStart,
  runBrainstormStatus,
  runMaintain,
  type BrainstormPromoteResult,
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

/** 把 scratchpad 推到 READY_TO_PROMOTE（promote 测试前置；形态与 CLI 写入侧一致）。 */
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
    // 手工把 scratchpad 推到 READY_TO_PROMOTE。
    await seedReadyToPromote("idea-apply");
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
