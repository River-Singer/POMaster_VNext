/**
 * w5-replay-index.spec.ts —— 历史事故回放索引清单 + Case A–G 映射完整性断言
 * （W5-FR10 出口锚；契约 w5-probe-contract §6；W0 promotion-audit.md §二 Replay
 * 分母表逐字对账）。
 *
 * 职责：给主编排终验收账的机器可复核映射表——每例：所属切片/测试文件+用例名/
 * 红断言/绿断言/独立性声明。断言三面：
 * 1. 结构完整性：R1–R7 恰 7 例（≥5 独立事故）、Case A–G 全覆盖映射；
 * 2. 可复核性：每例的测试文件在仓、describe/it 词形与红绿断言词形在文件中可检索
 *   （文本级复核——执行结果归各 spec 自身的真实运行）；
 * 3. 不冒充：事故 #2/#9/#10 不单设 replay 的重叠去向显式声明（promotion-audit
 *   「重叠不冒充独立事故数」纪律的机器化）。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** 单例索引行（promotion-audit §二 Replay 分母表的机器可复核形态）。 */
interface ReplayIndexRow {
  readonly replay: "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7";
  readonly case: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  /** 事故（promotion-audit §一审计表编号+摘要）。 */
  readonly incident: string;
  readonly slice: string;
  readonly specFile: string;
  readonly suiteName: string;
  readonly redAssertion: string;
  readonly greenAssertion: string;
  /** 红绿断言词形在该 spec 文件中的可检索锚（文本复核用）。 */
  readonly anchors: readonly string[];
}

const CLI_TESTS = "packages/cli/tests";

const REPLAY_INDEX: readonly ReplayIndexRow[] = [
  {
    replay: "R1", case: "C",
    incident: "#1 选中复选框后仍蓝底（selected/hover 双通道未入验证分母）",
    slice: "W1（PR-W1.3）",
    specFile: `${CLI_TESTS}/plan-runner.spec.ts`,
    suiteName: "Case C 回放（复选框三态；PR-W1.3）",
    redAssertion: "单态证据不满足整体（VERIFY_BLOCKED + 缺失场景显式点名）；原单态 GRN 保留 passed 不降级",
    greenAssertion: "三态证据补齐（重跑补执行）→ AWAITING_REPLAY_REVIEW；6 组合逐场景对账各恰一条",
    anchors: ["Case C 回放（复选框三态；PR-W1.3）", "VERIFY_BLOCKED", "scenario_ref="],
  },
  {
    replay: "R2", case: "D",
    incident: "#8 并行 vitest 互踩「坏池」结论（worker 竞争窗口冒充终验）",
    slice: "W2（PR-W2.3）",
    specFile: `${CLI_TESTS}/plan-runner.spec.ts`,
    suiteName: "Case D 回放（并行终验归属；PR-W2.3）",
    redAssertion: "final cohort 拒绝复用 worker 绿（VERIFY_BLOCKED + worker-local 不入终验分母）",
    greenAssertion: "稳定窗口独立终验（final_stable + window fresh）→ 机器验证链过闸；worker 证据 append-only 保留",
    anchors: ["Case D 回放（并行终验归属；PR-W2.3）", "worker_local", "final_stable", "VERIFY_BLOCKED"],
  },
  {
    replay: "R3", case: "E",
    incident: "#4 mock 导入落库 / real 仅解析（shape 对称≠mutation 对称）",
    slice: "W5（PR-W5.3）",
    specFile: `${CLI_TESTS}/w5-boundary-replay.spec.ts`,
    suiteName: "Case E 回放（R3：mock/real mutation 分裂；PR-W5.3 · W0 R3）",
    redAssertion: "seam 比较器 mutation_outcome 维度分歧（w5_seam_divergent：mock persisted=true ≠ real persisted=false）+ real 腿 persist 段持久化摘要缺席",
    greenAssertion: "real 腿补落库语义（双腿一致）→ w5_seam_divergent 消除、双腿 passed、注入轮 GRN append-only 保留",
    anchors: ["Case E 回放（R3：mock/real mutation 分裂；PR-W5.3 · W0 R3）", "w5_seam_divergent", "mock persisted=true ≠ real persisted=false"],
  },
  {
    replay: "R4", case: "F",
    incident: "#3 BUC 保存 200 但列表不可见（创建无项目绑定而列表带 project_id 过滤）",
    slice: "W5（PR-W5.3）",
    specFile: `${CLI_TESTS}/w5-boundary-replay.spec.ts`,
    suiteName: "Case F 回放（R4：保存 200 但 scope 不可见；PR-W5.3 · W0 R4）",
    redAssertion: "oracle 声明链 visible 段不可见（w5_oracle_visible_chain_incomplete + visible_result=false）——write 200/persist/re_read/mapping 全在场仅 visible 断",
    greenAssertion: "修复 server 端 scope 绑定 → request→persist→re_read→mapping→visible 全链 + visible_result=true（visible_via=api_list）",
    anchors: ["Case F 回放（R4：保存 200 但 scope 不可见；PR-W5.3 · W0 R4）", "w5_oracle_visible_chain_incomplete", "visible_result=false", "fixture_layer=node_http_service"],
  },
  {
    replay: "R5", case: "A",
    incident: "#5 BP 重发布后 104 文件钉旧锚 state=authorized（失效靠人工传播）",
    slice: "W3（PR-W3.1/3.2）",
    specFile: `${CLI_TESTS}/w3-replay.spec.ts`,
    suiteName: "Case A 回放（R5：BP 重发布 100+ 下游 refs）",
    redAssertion: "旧锚失效后下游 refs 无 affected 呈现（闭包分类缺失）",
    greenAssertion: "闭包覆盖 104 下游 + 分类正确（重编译/重绑定/重资格/审阅）+ Human Decision 字节不动",
    anchors: ["Case A 回放（R5：BP 重发布 100+ 下游 refs）", "Human Decision 字节不动"],
  },
  {
    replay: "R6", case: "B",
    incident: "#7 PageSpec 落后源蓝图（generated 无 freshness 绑定）",
    slice: "W3（PR-W3.2）",
    specFile: `${CLI_TESTS}/w3-replay.spec.ts`,
    suiteName: "Case B 回放（R6：旧 generated 未重建）",
    redAssertion: "改源后 --check 判 stale（STALE_GROUNDING）+ 消费端拒当 current authority",
    greenAssertion: "重建后按新指纹重新判定 fresh",
    anchors: ["Case B 回放（R6：旧 generated 未重建）", "STALE_GROUNDING"],
  },
  {
    replay: "R7", case: "G",
    incident: "#6 两份 BP 手册均自称 canonical（校验只看 .trellis 侧）",
    slice: "W3（PR-W3.2/3.3）",
    specFile: `${CLI_TESTS}/w3-replay.spec.ts`,
    suiteName: "Case G 回放（R7：双 canonical Authority 冲突）",
    redAssertion: "同维度双 canonical → AUTHORITY_CONFLICT 条目（provenance 全呈现 + Owner 裁决路标）——静默按序取胜者不可再发生",
    greenAssertion: "不同维度并存 → 零 conflict 条目（不误报）；显式 supersession 声明 → superseded 消歧不入队",
    anchors: ["Case G 回放（R7：双 canonical Authority 冲突）", "AUTHORITY_CONFLICT"],
  },
];

/** promotion-audit §二映射注记：不单设 replay 的事故去向（重叠不冒充独立事故数）。 */
const OVERLAP_DISPOSITION = {
  "#2 编辑回填占位值后 PUT 抹库（detail-only 缺值腿）": "并入 R3 语义比较的缺值腿——shape/nullability nullable 分歧断言见 packages/gauntlet-lite/test/seam-comparator.spec.ts（detail-only 缺值腿分歧）",
  "#9 插入退役标记后 registered_ref 指错位置（行号身份漂移）": "W3/W4 的 AC-09 插入行导航行为测试承接（不单设 replay）",
  "#10 四类 UI 控件多族并存（先例路由缺失）": "W4 的 AC-10 AG Grid 路由验收承接（不单设 replay）",
} as const;

describe("W5 回放索引清单（≥5 独立事故 + Case A–G 完整映射——主编排终验收账面）", () => {
  it("结构完整性：R1–R7 恰 7 例（≥5 独立事故）、编号唯一、Case A–G 全覆盖且映射与 promotion-audit 一致", () => {
    expect(REPLAY_INDEX).toHaveLength(7);
    expect(new Set(REPLAY_INDEX.map((row) => row.replay)).size).toBe(7);
    // 独立事故分母：7 ≥ 5（PRD AC：至少 5 个独立历史事故）。
    expect(REPLAY_INDEX.length).toBeGreaterThanOrEqual(5);
    const caseToReplay = new Map(REPLAY_INDEX.map((row) => [row.case, row.replay]));
    expect(caseToReplay).toEqual(new Map([
      ["A", "R5"], ["B", "R6"], ["C", "R1"], ["D", "R2"], ["E", "R3"], ["F", "R4"], ["G", "R7"],
    ]));
    // 每例四要素齐备（切片/测试文件+用例名/红断言/绿断言）。
    for (const row of REPLAY_INDEX) {
      expect(row.slice, row.replay).toContain("PR-");
      expect(row.suiteName.length).toBeGreaterThan(0);
      expect(row.redAssertion.length).toBeGreaterThan(0);
      expect(row.greenAssertion.length).toBeGreaterThan(0);
    }
  });

  it("可复核性：每例 spec 文件在仓、suite 名与红绿断言词形在文件中可检索（文本级复核——执行归各 spec）", () => {
    for (const row of REPLAY_INDEX) {
      const path = join(process.cwd(), row.specFile);
      expect(existsSync(path), `${row.replay} 的 ${row.specFile} 须在仓`).toBe(true);
      const source = readFileSync(path, "utf8");
      expect(source.includes(row.suiteName), `${row.replay} suite 名「${row.suiteName}」须可检索`).toBe(true);
      for (const anchor of row.anchors) {
        expect(source.includes(anchor), `${row.replay} 锚词「${anchor}」须在 ${row.specFile}`).toBe(true);
      }
    }
  });

  it("不冒充：事故 #2/#9/#10 的重叠去向显式声明（并入/承接——不冒充独立事故数）", () => {
    expect(Object.keys(OVERLAP_DISPOSITION)).toHaveLength(3);
    // #2 并入 R3 缺值腿的锚必须在 seam 比较器 spec 中真实可检索。
    const seamSpec = readFileSync(join(process.cwd(), "packages/gauntlet-lite/test/seam-comparator.spec.ts"), "utf8");
    expect(seamSpec).toContain("detail-only 缺值腿分歧");
    expect(seamSpec).toContain("oracle mapping_fields");
  });

  it("当前切片（W5 R3/R4）的回放走真实链：fixture 声明 node_http_service（非 Node 伪 UI 对象冒充）", () => {
    const boundarySpec = readFileSync(join(process.cwd(), `${CLI_TESTS}/w5-boundary-replay.spec.ts`), "utf8");
    expect(boundarySpec).toContain('kind: "node_http_service"');
    expect(boundarySpec).toContain("does_not_prove");
    // business oracle 词形（契约 §1）在 oracle 义务场景中声明（三类观察不可折叠）。
    expect(boundarySpec).toContain('visible_via: "api_list"');
    expect(boundarySpec).toContain('filter_context: { project_id: "p-1" }');
  });
});
