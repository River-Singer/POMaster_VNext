/**
 * adversarial-research-write-contract.spec.ts —— L4 对抗性 Eval Set（威胁类 7+8，P18-Adversarial）。
 *
 * 威胁类 7「Research 越写旁路」（§81.3 Read-only Contract）：改 Current Truth /
 * 业务代码 / `..` 与盘符逃逸 / 跨宿主偷渡 / 敌意宿主词形——全部真实 runCli 实跑：
 * exit 1 + RESEARCH_CONTRACT_FATAL（或宿主闸 SCHEMA_INVALID）显式码位 + 全树字节
 * 快照零变。「判卷失败零落盘」是字节级断言，不是恒真口头条款。
 * 威胁类 8「提升写入通道旁路」（Discovery 不私造第二写入通道，PRD §80.3 + P11）：
 * 伪造 scratchpad 终态 / 缺省 promote 直写企图 / 词表外链态 / 终态再提升 / 借
 * Research 会话改链——全部不产生治理事实（store 是唯一权威面，scratchpad 文件不是）。
 * 判卷面「幻觉洗白」（P18 红队发现1，§81.4 六字段）：AUTHORITATIVE 级零 sources/零
 * caveats finding 经真实 research inspect 全链不放行（exit 1 + RESEARCH_FINDING_INVALID
 * + all_ok=false）——防幻觉链任何机器点不得 fail-open。
 *
 * 非恒真对照：ADV-R7 申报 research/ 内 scratch 工作文件 → exit 0（判卷器不是全拒
 * 恒真）；合法提升落账 + closeout 续接的正向全链由 fixture-discovery-chain.spec.ts
 * （L2）承载——两件合起来才证明「该拒的拒、该放的放」。
 *
 * 每个用例注释标注：威胁类 + 「若防御失效会怎样」一句话。
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { envelopeOf, runJsonStep, type StepRecord } from "./fixture-chain-lib.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pvnext-adv-research-"));
});

afterEach(() => {
  // 临时目录留给 OS tmp 清理；不做 rm（避免 Windows EBUSY 噪声，同 L4 既有件）。
  void root;
});

// ============================================================
// fixture 助手
// ============================================================

function padPath(id: string): string {
  return `.pomaster/discovery/scratchpads/${id}/`;
}

function padDiskPath(id: string): string {
  return join(root, ".pomaster", "discovery", "scratchpads", id);
}

/** 全树字节快照（相对路径:内容 字典序；「零落盘」字节级断言的对比基线）。
 * excludeDiscovery=true 时排除 .pomaster/discovery（§80.2 授权的 scratchpad 维护面——
 * promote 的 tx 文件合法落点，不属于「store 旁路」判定分母）。 */
function snapshotRoot(excludeDiscovery = false): string[] {
  const entries: string[] = [];
  const walk = (current: string, rel: string): void => {
    if (excludeDiscovery && rel === ".pomaster/discovery") return;
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
  walk(root, "");
  return entries.sort();
}

async function startPad(id: string): Promise<StepRecord> {
  return runJsonStep(root, ["brainstorm", "start", "--id", id]);
}

/** 把 scratchpad 推到 READY_TO_PROMOTE（§80.2 授权的 scratchpad 维护面直写）。 */
function seedReadyToPromote(id: string): void {
  writeFileSync(
    join(padDiskPath(id), "state.json"),
    `${JSON.stringify(
      {
        state: "READY_TO_PROMOTE",
        scratchpad_ref: padPath(id),
        promotion_basis: "msd_reached",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

// ============================================================
// 威胁类 7：Research 越写旁路（§81.3 Read-only Contract）
// ============================================================

describe("威胁类 7：Research 越写旁路（越写即 FATAL + 字节级零落盘）", () => {
  it("ADV-R1 越写治理 state 面（truth-index）→ FATAL governed_surface + 全树字节零变", async () => {
    // 若防御失效：Research 会话成为 Current Truth 的第二写入通道——store 事务面
    // （A1 成对/rev 单调/journal 留痕）被整体旁路，§81.3 契约形同虚设。
    await runJsonStep(root, ["init"]);
    await startPad("idea-r1");
    const before = snapshotRoot();
    const rec = await runJsonStep(root, [
      "research",
      "越写尝试",
      "--host",
      padPath("idea-r1"),
      "--write",
      ".pomaster/state/truth-index.json",
    ]);
    expect(rec.code).toBe(1);
    const env = envelopeOf(rec);
    expect(env.ok).toBe(false);
    expect(env.errors[0]?.code).toBe("RESEARCH_CONTRACT_FATAL");
    expect(env.errors[0]?.message).toContain("governed_surface");
    expect(env.errors[0]?.hint).toContain("store 事务");
    expect(snapshotRoot()).toEqual(before);
  });

  it("ADV-R2 越写业务代码 → FATAL outside_research_dir；既有 artifact 一字节不动", async () => {
    // 若防御失效：Research 直接改实现代码——研究面变成开发面，八拍② permit 锁被绕过。
    await startPad("idea-r2");
    const pad = padPath("idea-r2");
    const scaffold = await runJsonStep(root, ["research", "先建合法骨架", "--host", pad]);
    expect(scaffold.code).toBe(0);
    const before = snapshotRoot();
    const rec = await runJsonStep(root, [
      "research",
      "越写尝试",
      "--host",
      pad,
      "--write",
      "src/pages/list.vue",
    ]);
    expect(rec.code).toBe(1);
    const env = envelopeOf(rec);
    expect(env.errors[0]?.code).toBe("RESEARCH_CONTRACT_FATAL");
    expect(env.errors[0]?.message).toContain("outside_research_dir");
    expect(snapshotRoot()).toEqual(before);
    expect(existsSync(join(root, "src"))).toBe(false);
  });

  it("ADV-R3 .. 逃逸段 + 根斜杠申报 → 双 FATAL path_not_portable（同轮全报不短路）", async () => {
    // 若防御失效：../ 相对逃逸写出仓外（provenance 可移植纪律虚设，产物无法跨机对账）。
    await startPad("idea-r3");
    const pad = padPath("idea-r3");
    const before = snapshotRoot();
    const rec = await runJsonStep(root, [
      "research",
      "逃逸尝试",
      "--host",
      pad,
      "--write",
      `${pad}research/../../escape.md`,
      "--write",
      "/abs/root.md",
    ]);
    expect(rec.code).toBe(1);
    const env = envelopeOf(rec);
    const fatals = env.errors.filter((e) => e.code === "RESEARCH_CONTRACT_FATAL");
    expect(fatals).toHaveLength(2);
    expect(fatals.every((e) => e.message.includes("path_not_portable"))).toBe(true);
    expect(snapshotRoot()).toEqual(before);
  });

  it("ADV-R4 盘符绝对路径申报 → FATAL path_not_portable + 可移植 hint", async () => {
    // 若防御失效：Windows 盘符路径混入治理产物引用，跨机/CI 全部悬空。
    await startPad("idea-r4");
    const before = snapshotRoot();
    const rec = await runJsonStep(root, [
      "research",
      "盘符尝试",
      "--host",
      padPath("idea-r4"),
      "--write",
      "D:\\tmp\\notes.md",
    ]);
    expect(rec.code).toBe(1);
    const env = envelopeOf(rec);
    expect(env.errors[0]?.code).toBe("RESEARCH_CONTRACT_FATAL");
    expect(env.errors[0]?.message).toContain("path_not_portable");
    expect(env.errors[0]?.hint).toContain("可移植");
    expect(snapshotRoot()).toEqual(before);
  });

  it("ADV-R5 跨宿主偷渡（借 A 会话申报 B 的 research 文件与 A 自己的 state.json）→ 双 outside_research_dir", async () => {
    // 若防御失效：宿主隔离失效——借合法会话写别的宿主的产物面/链状态文件。
    await startPad("idea-r5a");
    await startPad("idea-r5b");
    const padA = padPath("idea-r5a");
    const before = snapshotRoot();
    const rec = await runJsonStep(root, [
      "research",
      "偷渡尝试",
      "--host",
      padA,
      "--write",
      ".pomaster/discovery/scratchpads/idea-r5b/research/index.yaml",
      "--write",
      `${padA}state.json`,
    ]);
    expect(rec.code).toBe(1);
    const env = envelopeOf(rec);
    const fatals = env.errors.filter((e) => e.code === "RESEARCH_CONTRACT_FATAL");
    expect(fatals).toHaveLength(2);
    expect(fatals.every((e) => e.message.includes("outside_research_dir"))).toBe(true);
    // 宿主 B 的 scratchpad 本身合法存在（对抗前置创建），但它的 research/ 产物目录零创建。
    expect(existsSync(join(padDiskPath("idea-r5b"), "research"))).toBe(false);
    expect(snapshotRoot()).toEqual(before);
  });

  it("ADV-R6 敌意宿主词形（.. 逃逸）→ SCHEMA_INVALID（宿主闸先于写面闸，零创建）", async () => {
    // 若防御失效：逃逸宿主让 research/ 约定目录漂到仓外，写面判卷在被骗的根上放行。
    const before = snapshotRoot();
    const rec = await runJsonStep(root, [
      "research",
      "敌意宿主",
      "--host",
      "../outside/",
    ]);
    expect(rec.code).toBe(1);
    const env = envelopeOf(rec);
    expect(env.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(env.errors[0]?.message).toContain("--host");
    expect(existsSync(join(root, ".pomaster", "discovery"))).toBe(false);
    expect(snapshotRoot()).toEqual(before);
  });

  it("ADV-R7 非恒真对照：research/ 内 scratch 工作文件申报 → exit 0（kind=scratch），判卷器不是全拒恒真", async () => {
    // 对照位（防「全拒也算过对抗」假绿）：§81.3 允许写 <host>/research/**，
    // scratch 工作文件必须放行（正式产物寻址契约仍是四文件）。
    await startPad("idea-r7");
    const pad = padPath("idea-r7");
    const rec = await runJsonStep(root, [
      "research",
      "对照",
      "--host",
      pad,
      "--write",
      `${pad}research/notes-draft.md`,
    ]);
    expect(rec.code).toBe(0);
    const env = envelopeOf(rec);
    expect(env.ok).toBe(true);
    const plan = (env.result as { write_plan: { path: string; kind: string }[] }).write_plan;
    expect(plan).toHaveLength(5);
    expect(plan.filter((w) => w.kind === "artifact_file")).toHaveLength(4);
    const scratch = plan.find((w) => w.kind === "scratch");
    expect(scratch?.path).toBe(`${pad}research/notes-draft.md`);
    // 命令只判卷 + 骨架四文件；scratch 文件由 Research Agent 后续自写（申报 ≠ 落盘）。
    expect(existsSync(join(root, ...`${pad}research/notes-draft.md`.split("/")))).toBe(false);
    expect(existsSync(join(root, ...`${pad}research/index.yaml`.split("/")))).toBe(true);
  });
});

// ============================================================
// 威胁类 8：提升写入通道旁路（Discovery 不私造第二写入通道）
// ============================================================

describe("威胁类 8：提升写入通道旁路（store 是唯一权威面）", () => {
  it("ADV-C1 伪造 scratchpad 终态（state=TASK + promoted_ref）→ store 零事实：inspect/closeout 均 OBJECT_NOT_FOUND", async () => {
    // 若防御失效：手改 scratchpad JSON 等价于把治理对象写进 Current Truth，
    // P11 maintain 面（唯一受控写入面）虚设。
    await runJsonStep(root, ["init"]);
    await startPad("idea-fake");
    writeFileSync(
      join(padDiskPath("idea-fake"), "state.json"),
      `${JSON.stringify(
        {
          state: "TASK",
          promotion_basis: "user_explicit_request",
          promoted_ref: "TASK.FORGED",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    // 伪造可见不静默：status 照实呈现磁盘态……
    const status = await runJsonStep(root, ["brainstorm", "status"]);
    expect(status.code).toBe(0);
    const pads = (envelopeOf(status).result as {
      scratchpads: { discovery_id: string; state: string; promoted_ref: string | null }[];
    }).scratchpads;
    expect(pads[0]?.state).toBe("TASK");
    expect(pads[0]?.promoted_ref).toBe("TASK.FORGED");
    // ……但 store 权威面零事实：inspect 与 closeout 一致拒绝。
    const ins = await runJsonStep(root, ["inspect", "TASK.FORGED"]);
    expect(ins.code).toBe(1);
    expect(envelopeOf(ins).errors[0]?.code).toBe("OBJECT_NOT_FOUND");
    const co = await runJsonStep(root, ["closeout", "TASK.FORGED"]);
    expect(co.code).toBe(1);
    expect(envelopeOf(co).errors[0]?.code).toBe("OBJECT_NOT_FOUND");
  });

  it("ADV-C2 缺省 promote（无 --apply）→ store 字节零变 + 指路命令引回 maintain 面", async () => {
    // 若防御失效：promote 缺省路径顺手把对象写进 store——「提升走 P11 面」降级为口号。
    await runJsonStep(root, ["init"]);
    await startPad("idea-c2");
    seedReadyToPromote("idea-c2");
    // tx 文件落 scratchpad 是 §80.2 授权的 Discovery 平面（合法），不算 store 旁路——
    // store 零写判定排除 discovery 面，其余全树字节零变。
    const before = snapshotRoot(true);
    const rec = await runJsonStep(root, [
      "brainstorm",
      "promote",
      "idea-c2",
      "--to",
      "TASK",
      "--basis",
      "msd_reached",
    ]);
    expect(rec.code).toBe(0);
    const result = envelopeOf(rec).result as {
      applied: boolean;
      suggested_command: string;
      promoted_ref: string;
    };
    expect(result.applied).toBe(false);
    expect(result.suggested_command).toContain("maintain idea-c2");
    expect(result.suggested_command).toContain("--ops");
    expect(result.promoted_ref).toBe("TASK.IDEA_C2");
    // store 全树字节零变；对象此刻不存在：提升未落库，不冒充已提升。
    expect(snapshotRoot(true)).toEqual(before);
    const ins = await runJsonStep(root, ["inspect", "TASK.IDEA_C2"]);
    expect(ins.code).toBe(1);
    expect(envelopeOf(ins).errors[0]?.code).toBe("OBJECT_NOT_FOUND");
  });

  it("ADV-C3 伪造词表外链态（state=TASKS）→ promote DISCOVERY_TRANSITION_BLOCKED unknown_from_state + status 显式 warning", async () => {
    // 若防御失效：链外词形从旁门进入提升面，状态链词表（08 冻结）形同虚设。
    await startPad("idea-c3");
    writeFileSync(
      join(padDiskPath("idea-c3"), "state.json"),
      `${JSON.stringify({ state: "TASKS" }, null, 2)}\n`,
      "utf8",
    );
    const before = snapshotRoot();
    const rec = await runJsonStep(root, [
      "brainstorm",
      "promote",
      "idea-c3",
      "--to",
      "TASK",
      "--basis",
      "msd_reached",
    ]);
    expect(rec.code).toBe(1);
    const env = envelopeOf(rec);
    expect(env.errors[0]?.code).toBe("DISCOVERY_TRANSITION_BLOCKED");
    expect(env.errors[0]?.message).toContain("unknown_from_state");
    // tx 文件不落盘（链闸在写面前）。
    expect(existsSync(join(padDiskPath("idea-c3"), "promote-tx.json"))).toBe(false);
    expect(snapshotRoot()).toEqual(before);
    // status 对词表外链态显式 warning（残缺不冒充正常驻留）。
    const status = await runJsonStep(root, ["brainstorm", "status"]);
    expect(
      (envelopeOf(status).warnings ?? []).some((w) => w.code === "SCRATCHPAD_STATE_INVALID"),
    ).toBe(true);
  });

  it("ADV-C4 真实终态（promote --apply 落库到 TASK）后再 promote → 终态无出边 + store 不二次触发", async () => {
    // 若防御失效：终态可再提升 → 同一 discovery 反复挪动/复制正式对象，谱系（rev/sources）被搅浑。
    await runJsonStep(root, ["init"]);
    await startPad("idea-c4");
    seedReadyToPromote("idea-c4");
    const first = await runJsonStep(root, [
      "brainstorm",
      "promote",
      "idea-c4",
      "--to",
      "TASK",
      "--basis",
      "needs_formal_resources",
      "--apply",
    ]);
    expect(first.code).toBe(0);
    const storeAfterFirst = snapshotRoot();
    const second = await runJsonStep(root, [
      "brainstorm",
      "promote",
      "idea-c4",
      "--to",
      "TASK",
      "--basis",
      "needs_formal_resources",
      "--apply",
    ]);
    expect(second.code).toBe(1);
    const env = envelopeOf(second);
    expect(env.errors[0]?.code).toBe("DISCOVERY_TRANSITION_BLOCKED");
    expect(env.errors[0]?.message).toContain("transition_not_in_matrix");
    expect(env.errors[0]?.hint).toContain("终态");
    // store 字节零变：第二次企图零施断（无 rev 空转、无 journal 追加）。
    expect(snapshotRoot()).toEqual(storeAfterFirst);
  });

  it("ADV-C5 借 Research 会话改链状态（申报宿主自己的 state.json）→ FATAL outside_research_dir + 链态字节不变", async () => {
    // 威胁 7/8 同闸交叉验证：Research 写面即使只针对 Discovery 链状态文件也在
    // research/ 外——链状态只归 scratchpad 维护面（§80.2）+ promote 命令，Research 无权触碰。
    await startPad("idea-c5");
    const pad = padPath("idea-c5");
    const before = snapshotRoot();
    const rec = await runJsonStep(root, [
      "research",
      "改链企图",
      "--host",
      pad,
      "--write",
      `${pad}state.json`,
    ]);
    expect(rec.code).toBe(1);
    expect(envelopeOf(rec).errors[0]?.code).toBe("RESEARCH_CONTRACT_FATAL");
    expect(envelopeOf(rec).errors[0]?.message).toContain("outside_research_dir");
    expect(snapshotRoot()).toEqual(before);
  });

  it("ADV-C6 伪造 CHANGE 终态再企图提升 → 终态无出边 + CHANGE.SNEAKY 零事实", async () => {
    // 若防御失效：伪造「已提升为 CHANGE」的 scratchpad 能再走提升面二次生成正式对象。
    await runJsonStep(root, ["init"]);
    await startPad("idea-c6");
    writeFileSync(
      join(padDiskPath("idea-c6"), "state.json"),
      `${JSON.stringify(
        {
          state: "CHANGE",
          promotion_basis: "msd_reached",
          promoted_ref: "CHANGE.SNEAKY",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const rec = await runJsonStep(root, [
      "brainstorm",
      "promote",
      "idea-c6",
      "--to",
      "CHANGE",
      "--basis",
      "msd_reached",
    ]);
    expect(rec.code).toBe(1);
    const env = envelopeOf(rec);
    expect(env.errors[0]?.code).toBe("DISCOVERY_TRANSITION_BLOCKED");
    expect(env.errors[0]?.hint).toContain("终态");
    const ins = await runJsonStep(root, ["inspect", "CHANGE.SNEAKY"]);
    expect(ins.code).toBe(1);
    expect(envelopeOf(ins).errors[0]?.code).toBe("OBJECT_NOT_FOUND");
  });
});

// ============================================================
// 判卷面：幻觉洗白（P18 红队发现1；§81.4 六字段存在性）
// ============================================================

describe("判卷面：幻觉洗白（AUTHORITATIVE 零 sources/零 caveats 不放行全链）", () => {
  it("ADV-H1 AUTHORITATIVE 零 sources/零 caveats finding → research inspect exit 1 + RESEARCH_FINDING_INVALID + all_ok=false", async () => {
    // 若防御失效：零来源断言借最高证据级洗白——inspect 全链 exit 0/all_ok=true，
    // 幻觉结论顺 handoff 三件流进主 Agent 消费面（防幻觉链 fail-open）。
    await startPad("idea-hw");
    const pad = padPath("idea-hw");
    const scaffold = await runJsonStep(root, ["research", "先建合法骨架", "--host", pad]);
    expect(scaffold.code).toBe(0);
    const indexPath = join(
      padDiskPath("idea-hw"),
      "research",
      "index.yaml",
    );
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
      findings: unknown[];
      handoff: { one_line_summary: string };
    };
    index.findings = [
      {
        statement: "官方确认 Single HTTP Client 架构",
        evidence_type: "AUTHORITATIVE",
        sources: [],
        confidence: "HIGH",
        authority_effect: "NONE",
        caveats: [],
      },
    ];
    index.handoff = { ...index.handoff, one_line_summary: "结论已定" };
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    // 真实 runCli 全链：exit 语义 + 显式码位 + 判卷报告 all_ok=false。
    const inspect = await runJsonStep(root, ["research", "inspect", `${pad}research/`]);
    expect(inspect.code).toBe(1);
    const env = envelopeOf(inspect);
    expect(env.ok).toBe(false);
    expect(env.errors[0]?.code).toBe("RESEARCH_FINDING_INVALID");
    const messages = env.errors.map((e) => e.message).join("|");
    expect(messages).toContain("SOURCES_EMPTY");
    expect(messages).toContain("CAVEATS_EMPTY");
    const adjudication = (
      env.result as {
        adjudication: { all_ok: boolean; violations: number } | null;
      }
    ).adjudication;
    expect(adjudication?.all_ok).toBe(false);
    expect((adjudication?.violations ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it("ADV-H2 非恒真对照：INFERENCE 空 sources 豁免（schema 唯一授权）+ caveats 非空 → exit 0", async () => {
    // 对照位（防「全拒也算过对抗」假绿）：10-research-artifact 明文「INFERENCE 级允许
    // 空列表——推断自既有证据组合」；判卷面必须精确放行该豁免。
    await startPad("idea-hw2");
    const pad = padPath("idea-hw2");
    const scaffold = await runJsonStep(root, ["research", "先建合法骨架", "--host", pad]);
    expect(scaffold.code).toBe(0);
    const indexPath = join(padDiskPath("idea-hw2"), "research", "index.yaml");
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
      findings: unknown[];
      handoff: { one_line_summary: string };
    };
    index.findings = [
      {
        statement: "综合既有证据推断选型倾向",
        evidence_type: "INFERENCE",
        sources: [],
        confidence: "LOW",
        authority_effect: "NONE",
        caveats: ["推断自既有证据组合，非独立来源"],
      },
    ];
    index.handoff = { ...index.handoff, one_line_summary: "推断性结论（低置信）" };
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    const inspect = await runJsonStep(root, ["research", "inspect", `${pad}research/`]);
    expect(inspect.code).toBe(0);
    const env = envelopeOf(inspect);
    expect(env.ok).toBe(true);
    expect(
      (env.result as { adjudication: { all_ok: boolean } | null }).adjudication?.all_ok,
    ).toBe(true);
  });
});
