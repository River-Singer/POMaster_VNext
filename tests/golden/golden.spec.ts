/**
 * golden.spec.ts —— Golden P0 批次1（20 条数据驱动）＋ 执行器参考镜像单元测试。
 *
 * 运行入口（数据驱动）：cases.json 逐条 → runGoldenCase；可执行判定通过（passed），
 * 不可执行判定显式 pending（附原因，进报告 pendingList——禁静默跳过）。
 * 报告落盘：coverage/golden-report.json（幂等可重放，零墙钟字段）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { LIFECYCLE_TRANSITIONS, LIFECYCLE_VALUES } from "@pomaster/schemas";
import {
  loadGoldenCases,
  reportIsConsistent,
  runAllCases,
  runGoldenCase,
  verdictWordViolations,
  checkTransition,
  parseId,
  resolveAliasChecked,
  runTriage,
  type GoldenReport,
} from "./golden.harness.js";
import { validateTransitionReference } from "./reference/transition.js";
import { parseGovernedIdReference, resolveAliasReference } from "./reference/governed-id.js";
import { triageRuleV0 } from "./reference/triage.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { suite, cases } = loadGoldenCases();
const report: GoldenReport = runAllCases(cases);

afterAll(() => {
  const outDir = join(repoRoot, "coverage");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "golden-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  for (const p of report.pendingList) {
    console.log(`[golden][pending] ${p.id} — ${p.reason}`);
  }
  console.log(
    `[golden] ${report.passed} passed / ${report.failed} failed / ${report.pending} pending（共 ${report.total}；evaluator kernel=${report.evaluatorSummary.kernel} reference=${report.evaluatorSummary.reference}）`,
  );
});

// ============================================================
// 数据驱动主面：20 条 P0 逐条
// ============================================================

describe(`Golden P0 批次1 数据驱动（${suite}：${cases.length} 条）`, () => {
  const byId = new Map(report.results.map((r) => [r.id, r]));
  for (const c of cases) {
    const kind = c.executable === null ? "pending" : c.executable.kind;
    it(`${c.id}（${kind}）：${c.title}`, () => {
      const r = byId.get(c.id);
      expect(r, `用例 ${c.id} 未产生结果`).toBeDefined();
      if (r === undefined) return;
      if (r.status === "pending") {
        // 显式缺席：pending 必须带非空原因（禁静默跳过当通过）。
        expect(r.detail, `pending 用例 ${c.id} 缺缺席原因`).toBeTruthy();
        return;
      }
      expect(r.status, `${c.id}：${r.detail}`).toBe("passed");
    });
  }
});

// ============================================================
// 元纪律
// ============================================================

describe("Golden 元纪律", () => {
  it("cases.json：恰 20 条、id 唯一、全部 P0", () => {
    expect(cases.length).toBe(20);
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(cases.every((c) => c.p0 === true)).toBe(true);
  });

  it("verdict 词形：expected.verdict/alternatives 与 03 七态枚举逐字一致（含 null 合法）", () => {
    expect(verdictWordViolations(cases)).toEqual([]);
  });

  it("pending 显式入账：每条不可执行用例带非空原因，executable+pending=total", () => {
    const nonExecutable = cases.filter((c) => c.executable === null);
    expect(report.pendingList.length).toBe(nonExecutable.length);
    expect(report.pendingList.every((p) => p.reason.length > 0)).toBe(true);
    expect(report.executable + report.pending).toBe(report.total);
  });

  it("报告自洽：total/passed/failed/pending 计数闭环", () => {
    expect(reportIsConsistent(report)).toBe(true);
  });
});

// ============================================================
// 执行器参考镜像 · kernel 转移校验
// ============================================================

describe("执行器参考镜像 · 转移校验（vocab-lock state_axes.lifecycle.transitions）", () => {
  it("PROPOSED→CURRENT 放行且 requires=[authority_approval]", () => {
    const r = checkTransition("PROPOSED", "CURRENT");
    expect(r.allowed).toBe(true);
    expect(r.requires).toEqual(["authority_approval"]);
    expect(r.gracePolicyConfig).toBe(false);
  });

  it("CURRENT→DEPRECATED 放行且 requires=[transition_record]", () => {
    const r = checkTransition("CURRENT", "DEPRECATED");
    expect(r.allowed).toBe(true);
    expect(r.requires).toEqual(["transition_record"]);
  });

  it("DEPRECATED→RETIRED 放行且 gracePolicyConfig=true（grace_policy: config）", () => {
    const r = checkTransition("DEPRECATED", "RETIRED");
    expect(r.allowed).toBe(true);
    expect(r.gracePolicyConfig).toBe(true);
  });

  it("PROPOSED→RETIRED 越矩阵拒绝（transition_not_in_matrix＋hint 路标）", () => {
    const r = checkTransition("PROPOSED", "RETIRED");
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("transition_not_in_matrix");
    expect(r.hint?.length ?? 0).toBeGreaterThan(0);
  });

  it("SUPERSEDED→CURRENT（撤销 supersede）拒绝且 hint 指向新建对象（开放问题#1 lock 胜出）", () => {
    const r = checkTransition("SUPERSEDED", "CURRENT");
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("transition_not_in_matrix");
    expect(r.hint).toContain("新建对象");
  });

  it("RETIRED→PROPOSED 终态拒绝", () => {
    const r = checkTransition("RETIRED", "PROPOSED");
    expect(r.allowed).toBe(false);
  });

  it("废止词 ACCEPTED → unknown_from_state（词表外值不进状态机）", () => {
    const r = checkTransition("ACCEPTED", "CURRENT");
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("unknown_from_state");
  });

  it("参考镜像与 @pomaster/schemas LIFECYCLE_TRANSITIONS 全对账（词表单一事实源）", () => {
    for (const from of LIFECYCLE_VALUES) {
      for (const to of LIFECYCLE_VALUES) {
        const legal = (LIFECYCLE_TRANSITIONS[from] as readonly string[]).includes(to);
        const ref = validateTransitionReference(from, to);
        expect(ref.allowed, `${from}→${to}`).toBe(legal);
      }
    }
  });
});

// ============================================================
// 执行器参考镜像 · id 解析（A5 closed-world）
// ============================================================

describe("执行器参考镜像 · id 解析与别名双向链（A5/A6）", () => {
  it("PAGE.BIND_CARLINE 解析通过（prefix=PAGE，无 SEQ）", () => {
    const r = parseId("PAGE.BIND_CARLINE");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.prefix).toBe("PAGE");
      expect(r.parsed.seq).toBeNull();
    }
  });

  it("API_REQ.BIND.CARLINE.1 解析通过（末段 SEQ=1）", () => {
    const r = parseId("API_REQ.BIND.CARLINE.1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.seq).toBe(1);
      expect(r.parsed.segments).toEqual(["BIND", "CARLINE"]);
    }
  });

  it("TEST.FIXTURE.CAPABILITY.SAMPLE 解析通过（closed-world 含 TEST.，Q3）", () => {
    const r = parseId("TEST.FIXTURE.CAPABILITY.SAMPLE");
    expect(r.ok).toBe(true);
  });

  it("FOO.BAR_THING 未注册前缀 → unknown_prefix FATAL（A5）", () => {
    const r = parseId("FOO.BAR_THING");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown_prefix");
  });

  it("PAGE.001（SEQ 前缺 SEGMENT）→ grammar FATAL", () => {
    const r = parseId("PAGE.001");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("grammar");
  });

  it("page.bind_carline 小写 → grammar FATAL（SCREAMING_SNAKE）", () => {
    const r = parseId("page.bind_carline");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("grammar");
  });

  it("GRID.EDITABLE_GRID 作 canonical id → unknown_prefix FATAL（legacy 拼写不得为 canonical）", () => {
    const r = parseId("GRID.EDITABLE_GRID");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown_prefix");
  });

  it("参考镜像与 kernel 契约正则同构：resolveAliasReference 对 alias 常量零字面量（ALIASES_V0 五族可判别）", () => {
    for (const legacy of ["GRID.EDITABLE_GRID", "TASK-0087", "CHANGE-0104", "KB.FAILURE_PATTERN.CSV_NAIVE_SPLIT", "PAGE-TASK-STEP-BIND-CARLINE"]) {
      expect(
        resolveAliasReference(legacy).matchedRuleLegacy,
        legacy,
      ).not.toBeNull();
    }
  });
});

describe("执行器参考镜像 · alias 机械族与数据面分界", () => {
  it("GRID.EDITABLE_GRID → CAPABILITY.GRID.EDITABLE_GRID（机械换头）", () => {
    const r = resolveAliasChecked("GRID.EDITABLE_GRID");
    expect(r.canonical).toBe("CAPABILITY.GRID.EDITABLE_GRID");
    expect(r.matchedRuleLegacy).toBe("GRID.*");
  });

  it("TASK-0087 → TASK.T0087（数字段收编加字母前缀）", () => {
    const r = resolveAliasChecked("TASK-0087");
    expect(r.canonical).toBe("TASK.T0087");
  });

  it("CHANGE-0104 → CHANGE.C0104", () => {
    const r = resolveAliasChecked("CHANGE-0104");
    expect(r.canonical).toBe("CHANGE.C0104");
  });

  it("反向链：CAPABILITY.GRID.EDITABLE_GRID 的 legacyForms 含 GRID.EDITABLE_GRID（双向考古）", () => {
    const r = resolveAliasChecked("CAPABILITY.GRID.EDITABLE_GRID");
    expect(r.legacyForms).toContain("GRID.EDITABLE_GRID");
  });

  it("KB.FAILURE_PATTERN.CSV_NAIVE_SPLIT：家族命中但 canonical=null（段重排映射属数据面，不臆造）", () => {
    const r = resolveAliasChecked("KB.FAILURE_PATTERN.CSV_NAIVE_SPLIT");
    expect(r.matchedRuleLegacy).toBe("KB-*");
    expect(r.canonical).toBeNull();
  });
});

// ============================================================
// 执行器参考镜像 · triage rule_v0（thread-C §3.2/§7）
// ============================================================

describe("执行器参考镜像 · triage 规则桶（rule_v0 P0 子集）", () => {
  it("幂等：同输入两次判定字节全等（A4 零墙钟）", () => {
    const req = {
      declaredPaths: ["src/entities/bind-carline/api.ts"],
      contractSurfaceHit: true,
      requestedProfileOverride: "MINIMAL",
      projectLegacyMaster: true,
    } as const;
    expect(JSON.stringify(triageRuleV0(req))).toBe(
      JSON.stringify(triageRuleV0(req)),
    );
  });

  it("零信号输入 → NO_CHANGE（八拍①：无操作是合法成功）", () => {
    const d = triageRuleV0({});
    expect(d.outcome).toBe("NO_CHANGE");
    expect(d.effectiveProfile).toBeNull();
  });

  it("DOC_ONLY 快道：纯 docs/**/*.md → MINIMAL", () => {
    const d = triageRuleV0({ declaredPaths: ["README.md", "docs/guide.md"] });
    expect(d.fastPathHit).toBe("DOC_ONLY");
    expect(d.effectiveProfile).toBe("MINIMAL");
  });

  it("TEST_ONLY 快道：tests/** → MINIMAL", () => {
    const d = triageRuleV0({ declaredPaths: ["tests/a.spec.ts"] });
    expect(d.fastPathHit).toBe("TEST_ONLY");
    expect(d.effectiveProfile).toBe("MINIMAL");
  });

  it("E_CONTRACT 压过 MINIMAL 申报 → effective=STANDARD（§3.5 override≠bypass）", () => {
    const d = triageRuleV0({
      declaredPaths: ["src/entities/bind-carline/api.ts"],
      contractSurfaceHit: true,
      requestedProfileOverride: "MINIMAL",
    });
    expect(d.triggerHits).toContain("E_CONTRACT");
    expect(d.effectiveProfile).toBe("STANDARD");
    expect(d.overrideOverpoweredByEscalation).toBe(true);
  });

  it("floor 拒降档：override MINIMAL 撞 src/**→LIGHT floor → effective=LIGHT（C4）", () => {
    const d = triageRuleV0({
      declaredPaths: ["src/shared/widgets/mini.vue"],
      requestedProfileOverride: "MINIMAL",
      floorOverrides: [{ whenPath: ["src/**"], floor: "LIGHT" }],
    });
    expect(d.effectiveProfile).toBe("LIGHT");
    expect(d.floorApplied).toBe("src/**");
    expect(d.overrideBelowFloorRejected).toBe(true);
  });

  it("R-B：blastRadius=NOT_CONFIGURED → E_BLAST 未评估入账（禁按 false/true 处理）", () => {
    const d = triageRuleV0({
      declaredPaths: ["src/a.ts"],
      blastRadius: null,
      contractSurfaceHit: true,
    });
    expect(d.blindspots.notApplicableRules).toContain("E_BLAST");
    expect(d.triggerHits).toContain("E_CONTRACT");
  });

  it("hotfix 托底：profile_base LIGHT＋fast_lane（§7 when_task_type 逐条）", () => {
    const d = runTriage({ declaredPaths: ["src/hot.vue"], declaredType: "hotfix" }).decision;
    expect(d.fastLane).toBe(true);
    expect(d.effectiveProfile).toBe("LIGHT");
  });
});

// ============================================================
// 单用例执行器直查（runGoldenCase 分派冒烟：pending 与 passed 各抽一）
// ============================================================

describe("runGoldenCase 分派", () => {
  it("非可执行用例产出 pending 结果且带原因", () => {
    const c = cases.find((x) => x.id === "GOLDEN-L1-WALLCLOCK");
    expect(c).toBeDefined();
    const r = runGoldenCase(c as NonNullable<typeof c>);
    expect(r.status).toBe("pending");
    expect(r.detail.length).toBeGreaterThan(0);
  });

  it("可执行用例（transition）产出 passed 结果并记录 evaluator", () => {
    const c = cases.find((x) => x.id === "GOLDEN-L1-ILLEGAL-TRANSITION");
    expect(c).toBeDefined();
    const r = runGoldenCase(c as NonNullable<typeof c>);
    expect(r.status).toBe("passed");
    expect(["kernel", "reference"]).toContain(r.evaluator);
  });

  it("parseGovernedIdReference 与 parseId 参考回落同构", () => {
    const direct = parseGovernedIdReference("KNOWLEDGE.CSV_FAILURE_PATTERN");
    expect(direct.ok).toBe(true);
    const viaHarness = parseId("KNOWLEDGE.CSV_FAILURE_PATTERN");
    expect(viaHarness.ok).toBe(true);
  });
});
