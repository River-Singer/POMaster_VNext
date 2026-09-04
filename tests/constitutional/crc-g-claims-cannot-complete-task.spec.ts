/**
 * CRC-G —— Workspace 不能自完成 Task（Constitutional Regression Case G；纠错清单
 * §31 Case 7 + PRD 修订版 §9B CRC-G 行：task 文案不能改 canonical lifecycle（须走
 * 治理转换））。
 *
 * 【命名纪律声明（Batch 5 R1，全套件统一）】本套件是 vNext Constitutional Regression
 * Suite，文件一律 CRC-<X>- 前缀，与三套既有 "Case/宪法" 命名显式划界：
 * 1) PRD v0.4/0.5.2 §16 旧 Case A-H（另一套编号）；
 * 2) dot-pomaster-directory-constitution.md 目录宪法 §2/§11/§24/§34；
 * 3) benchmarks/constitutional.mjs 的 Constitutional/Architecture Change 性能基准档。
 * 三者均非本套件；本套件禁裸用 "Case A-H" 词形。
 *
 * 【规范锚】纠错 §31 Case 7 原文：「task.md: COMPLETED / Expected: Canonical Task
 * State unchanged until governed transition。」PRD §9B CRC-G：task 文案不能改
 * canonical lifecycle（须走治理转换）。
 *
 * 【联合锚设计（R2 跨面组合断言）】词面注记：VNext 无 task.md 文件面——§31 同构
 * 载体 = claims/scratchpad 声称平面 + store 轴面（verify 报告 Case G 判定同源）。
 * 分立检查已有封闭测试：forbidden-patterns.spec.ts:256（D20 注入 VERIFIED 被无视）、
 * closeout.spec.ts:321（DOD_CLAIM_NOT_VERIFIED 零写入）、transitions.spec.ts:23
 * （PROPOSED→CURRENT requires authority_approval）、fixture-discovery-chain.spec.ts:447
 * （施断被 CROSS_AXIS_ASSERTION 拒）。本 CRC 补跨面串联：**声称平面伪造 VERIFIED
 * （D20：声称方注入被 kernel 无视恒 UNVERIFIED）→ 轴面伪装完成（PROPOSED 抬
 * evidence→VERIFIED 被 CROSS_AXIS_ASSERTION 拒、真值索引字节零变更）→ 转移矩阵
 * 串联（PROPOSED→CURRENT 缺 authorityRef 被 EVOLUTION_REQUIRED 拒；带 Authority
 * 引用才 APPLIED）**——三层伪造全零变更，唯一通路是治理转换。
 *
 * 独立性：纯 kernel 进程内（L1），零网络/外部工具，确定性零墙钟，Windows 可跑。
 */
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyTransaction,
  GovernanceError,
  loadTruthIndex,
  type Store,
} from "@pomaster/kernel";
import { cid, makeCrcRoot, makeCrcStore, proposalEnvelope, txOf } from "./crc-lib.js";

let root: string;
let store: Store;

/** 提升诚实初值的 TASK 信封（PROPOSED/PLANNED——brainstorm promote 同款初值形态）。 */
function taskEnvelope(): Record<string, unknown> {
  return proposalEnvelope({
    id: cid("TASK.PAYMENT_FLOW"),
    kind: "task_object",
    axisProfile: "task_default",
    titleZh: "支付流程任务",
    axes: {
      lifecycle: "PROPOSED",
      confidence: "UNRESOLVED",
      evidence: "PLANNED",
      change: "STABLE",
    },
    payload: {
      intent: "实现支付流程（Discovery 提升）",
      acceptance: [
        {
          criterion: "支付主流程经独立验证流确认",
          claim: "CLM-0001",
        },
      ],
      class_scan_result: {
        scope: "crc-g fixture：Task 自完成锚（无同类代码修改）",
        hits: 0,
        fixed_count: 0,
        regression_case_ref: "crc-g-claims-cannot-complete-task.spec",
      },
    },
  });
}

const lifecycleOf = async (id: string): Promise<string | undefined> => {
  const index = await loadTruthIndex(store);
  return index.objects.find((o) => o.id === id)?.axes.lifecycle;
};

const truthIndexBytes = (): string =>
  readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");

beforeAll(async () => {
  root = makeCrcRoot("g");
  store = await makeCrcStore(root);
  await applyTransaction(store, txOf([{ op: "upsert_object", envelope: taskEnvelope() as never }]));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("CRC-G：task 文案不能改 canonical lifecycle——伪造三层全零变更，唯一通路是治理转换（§9B 行 G）", () => {
  it("声称平面：claims 平面伪造 VERIFIED（声称方注入判定）→ kernel 无视注入恒 UNVERIFIED + 重录覆写被拒（D20：判定归独立验证流）", async () => {
    await applyTransaction(store, {
      ops: [
        {
          op: "record_claim",
          claim: {
            clm: "CLM-0001",
            subjectId: cid("TASK.PAYMENT_FLOW"),
            assertion: "task.md 已写 COMPLETED，自评 VERIFIED（§31 Case 7 声称形态）",
            assertedBy: { actorType: "agent", actor: "claude/session-93", selfAttested: true },
            evidenceRefs: [],
            // 越权注入（TS 类型面无此字段；as never 模拟手改/绕过尝试——forbidden-patterns 先例）：
            verification: {
              verdict: "VERIFIED",
              recomputed_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
            },
          } as never,
        },
      ],
    });
    const claimFile = JSON.parse(
      readFileSync(
        join(root, ".pomaster", "evidence", "claims", "CLM-0001.json"),
        "utf8",
      ),
    ) as { verification: { verdict: string; recomputed_by: { actor: string; self_attested: boolean } } };
    expect(claimFile.verification.verdict).toBe("UNVERIFIED");
    expect(claimFile.verification.recomputed_by.actor).toBe("pomaster-kernel");
    expect(claimFile.verification.recomputed_by.self_attested).toBe(false);
    // record 通道无权覆写既有证据（同号重录 = 判定改判通路越权；A3 存在性防线）。
    const replay = await applyTransaction(store, {
      ops: [
        {
          op: "record_claim",
          claim: {
            clm: "CLM-0001",
            subjectId: cid("TASK.PAYMENT_FLOW"),
            assertion: "改口重录，试图洗成 VERIFIED",
            assertedBy: { actorType: "agent", actor: "claude/session-93", selfAttested: true },
            evidenceRefs: [],
          },
        },
      ],
    }).catch((e: unknown) => e);
    expect(replay).toBeInstanceOf(GovernanceError);
    expect((replay as GovernanceError).code).toBe("EVIDENCE_ALREADY_EXISTS");
  });

  it("轴面伪装：PROPOSED task 直抬 evidence→VERIFIED（伪装完成）→ CROSS_AXIS_ASSERTION 拒 + 真值索引字节零变更", async () => {
    const before = truthIndexBytes();
    const bad = await applyTransaction(store, {
      ops: [
        {
          op: "transition_object",
          id: cid("TASK.PAYMENT_FLOW"),
          patch: { evidence: "VERIFIED" },
          reasonShort: "task 文案说做完了",
        },
      ],
    }).catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(GovernanceError);
    expect((bad as GovernanceError).code).toBe("CROSS_AXIS_ASSERTION");
    expect((bad as GovernanceError).message).toContain("PLANNED");
    expect(truthIndexBytes()).toBe(before);
    expect(await lifecycleOf("TASK.PAYMENT_FLOW")).toBe("PROPOSED");
  });

  it("转移矩阵串联：PROPOSED→CURRENT 缺 authorityRef → EVOLUTION_REQUIRED；带 Authority 决议引用才 APPLIED（governed transition 唯一通路）", async () => {
    const transitionTx = (authorityRef?: string) =>
      txOf(
        [
          {
            op: "transition_object",
            id: cid("TASK.PAYMENT_FLOW"),
            patch: { lifecycle: "CURRENT" },
            reasonShort: "支付流程任务转 CURRENT",
          },
        ],
        authorityRef,
      );
    const bad = await applyTransaction(store, transitionTx()).catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(GovernanceError);
    expect((bad as GovernanceError).code).toBe("EVOLUTION_REQUIRED");
    // canonical lifecycle 在两次被拒后仍未被任何伪造通路改动。
    expect(await lifecycleOf("TASK.PAYMENT_FLOW")).toBe("PROPOSED");
    // 唯一合法通路：authorityRef（Owner Authority 审批引用）在场 → APPLIED。
    const result = await applyTransaction(store, transitionTx("DECISION.OWNER_START_PAYMENT"));
    expect(result.changedObjectIds).toContain("TASK.PAYMENT_FLOW");
    expect(await lifecycleOf("TASK.PAYMENT_FLOW")).toBe("CURRENT");
  });
});
