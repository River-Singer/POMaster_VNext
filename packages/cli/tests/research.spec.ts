/**
 * research.spec.ts —— §44.3 research 三命令（P18）。
 *
 * 判据：
 * - research <topic>：--mode 六模式词表（词表外显式拒绝）；--host 缺省解析（唯一活跃
 *   scratchpad 自动选中，多/零显式拒绝——不发明静默选择政策）；**Read-only Contract
 *   命令层强制**：--write 申报越写（业务代码/受治理面/盘符逃逸/换宿主）= FATAL exit 1
 *   且零落盘（判卷失败一个字节都不写）；合法路径产出四文件骨架（§81.6），幂等。
 * - research list：宿主不存在 = 显式错误（与「存在无产物」= 显式空清单区分）；artifact
 *   呈现 findings 计数与 SKELETON 标记。
 * - research inspect：四文件完整性（缺 → RESEARCH_ARTIFACT_INCOMPLETE）；自由 yaml 显式
 *   INDEX_NOT_MACHINE_PARSEABLE；findings 字段级损坏（键存在但非数组）→ 显式
 *   INDEX_NOT_MACHINE_PARSEABLE（B3：不静默折叠为空分母假绿，键真缺席仍合法空分母）；
 *   词表外 finding → RESEARCH_FINDING_INVALID exit 1；
 *   CONFLICTS → escalation warning（发现不是裁决）；骨架占位 → SKELETON warning；
 *   **P18 红队修复面**：发现1 六字段存在性（AUTHORITATIVE 零 sources/caveats 幻觉洗白
 *   fail-closed + INFERENCE 豁免对照 + FINDING_MALFORMED 不跳出判卷分母）+ 发现4 宿主位
 *   词形/存在性校验（../../ 穿透封死）；**发现2**：--host 三道闸（src 拒绝/未登记拒绝/
 *   tasks 目录合法对照）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runBrainstormStart,
  runResearchInspect,
  runResearchList,
  runResearchStart,
  type ResearchInspectResult,
  type ResearchListResult,
  type ResearchStartResult,
} from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-research-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function researchDirOf(host: string): string {
  return join(root, ...`${host}research/`.split("/"));
}

describe("research <topic>（§44.3 直跑形态；写面契约命令层强制）", () => {
  it("--mode 六模式逐一合法（argv 小写词形映射 §81.2 大写）", async () => {
    await runBrainstormStart(root, { id: "idea-modes" });
    for (const mode of ["internal", "external", "mixed", "comparative", "impact", "forensic"]) {
      const outcome = await runResearchStart(root, {
        topic: `topic-${mode}`,
        mode,
        host: ".pomaster/discovery/scratchpads/idea-modes/",
      });
      expect(outcome.ok, `mode=${mode} 应合法`).toBe(true);
      expect((outcome.result as ResearchStartResult).mode?.toUpperCase()).toBe(
        mode.toUpperCase(),
      );
    }
  });

  it("--mode 词表外 → SCHEMA_INVALID + 六模式 hint", async () => {
    await runBrainstormStart(root, { id: "idea-badmode" });
    const outcome = await runResearchStart(root, {
      topic: "t",
      mode: "vibes",
      host: ".pomaster/discovery/scratchpads/idea-badmode/",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.hint).toContain("forensic");
  });

  it("--host 缺省解析：唯一活跃 scratchpad 自动选中；零活跃 → RESEARCH_HOST_NOT_FOUND + brainstorm start 路标", async () => {
    const none = await runResearchStart(root, { topic: "t" });
    expect(none.ok).toBe(false);
    expect(none.errors[0]?.code).toBe("RESEARCH_HOST_NOT_FOUND");
    expect(none.errors[0]?.hint).toContain("brainstorm start");

    await runBrainstormStart(root, { id: "idea-solo" });
    const solo = await runResearchStart(root, { topic: "grid 选型" });
    expect(solo.ok).toBe(true);
    expect((solo.result as ResearchStartResult).host_ref).toBe(
      ".pomaster/discovery/scratchpads/idea-solo/",
    );
  });

  it("--host 多活跃 → AMBIGUOUS_HOST（不发明静默选择政策）", async () => {
    await runBrainstormStart(root, { id: "idea-a1" });
    await runBrainstormStart(root, { id: "idea-a2" });
    const outcome = await runResearchStart(root, { topic: "t" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("AMBIGUOUS_HOST");
  });

  it("合法路径：四文件骨架落盘（index.yaml JSON 兼容 + 三个 md）+ 写面申报全过", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-r/";
    await runBrainstormStart(root, { id: "idea-r" });
    const outcome = await runResearchStart(root, { topic: "grid 库选型", host });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as ResearchStartResult;
    expect(result.artifact_root).toBe(`${host}research/`);
    expect(result.write_plan).toHaveLength(4);
    expect(result.write_plan.every((w) => w.kind === "artifact_file")).toBe(true);
    expect(result.scaffold.created).toHaveLength(4);
    const index = JSON.parse(
      readFileSync(join(researchDirOf(host), "index.yaml"), "utf8"),
    ) as { artifact_root: string; findings: unknown[]; handoff: { one_line_summary: string } };
    expect(index.artifact_root).toBe(`${host}research/`);
    expect(index.findings).toEqual([]);
    expect(index.handoff.one_line_summary.startsWith("SKELETON")).toBe(true);
  });

  it("重复执行幂等：第二次骨架全 skipped（已存在不覆盖）", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-idem/";
    await runBrainstormStart(root, { id: "idea-idem" });
    await runResearchStart(root, { topic: "t1", host });
    const second = await runResearchStart(root, { topic: "t2", host });
    expect(second.ok).toBe(true);
    expect((second.result as ResearchStartResult).scaffold.skipped).toHaveLength(4);
    expect((second.result as ResearchStartResult).scaffold.created).toHaveLength(0);
  });

  it("对抗：--write 申报越写业务代码 → RESEARCH_CONTRACT_FATAL exit 语义 + 零落盘", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-evil/";
    await runBrainstormStart(root, { id: "idea-evil" });
    const outcome = await runResearchStart(root, {
      topic: "t",
      host,
      write: ["src/pages/list.vue"],
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("RESEARCH_CONTRACT_FATAL");
    expect(outcome.errors[0]?.hint).toContain("research/");
    // 判卷失败零落盘：research/ 目录一个字节都不写。
    expect(existsSync(researchDirOf(host))).toBe(false);
  });

  it("对抗：--write 触碰受治理面（.pomaster/state/）→ FATAL governed_surface；证据平面 hint 指路 record", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-gov/";
    await runBrainstormStart(root, { id: "idea-gov" });
    const stateWrite = await runResearchStart(root, {
      topic: "t",
      host,
      write: [".pomaster/state/truth-index.json"],
    });
    expect(stateWrite.ok).toBe(false);
    expect(stateWrite.errors[0]?.hint).toContain("store 事务");

    const evWrite = await runResearchStart(root, {
      topic: "t",
      host,
      write: [".pomaster/evidence/claims/CLM-1.json"],
    });
    expect(evWrite.ok).toBe(false);
    expect(evWrite.errors[0]?.hint).toContain("record");
    expect(existsSync(researchDirOf(host))).toBe(false);
  });

  it("对抗：--write 盘符路径 → FATAL path_not_portable（provenance 可移植纪律）", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-drv/";
    await runBrainstormStart(root, { id: "idea-drv" });
    const outcome = await runResearchStart(root, {
      topic: "t",
      host,
      write: ["D:\\tmp\\notes.md"],
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.hint).toContain("可移植");
  });

  it("对抗（发现2）：--host 业务源码目录（src）→ SCHEMA_INVALID 登记面拒绝，业务树零落盘", async () => {
    // 若防御失效：--host src 让 research 四文件骨架写进业务源码树——写面判卷只锁
    // <host>/research/** 之下，锁不住宿主位本身落在业务树（Read-only Contract 破防）。
    const outcome = await runResearchStart(root, { topic: "t", host: "src" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("登记面");
    expect(outcome.errors[0]?.hint).toContain("brainstorm start");
    expect(existsSync(join(root, "src"))).toBe(false);
  });

  it("对抗（发现2）：--host 登记面词形正确但未登记（scratchpad 不存在）→ RESEARCH_HOST_NOT_FOUND", async () => {
    const ghost = ".pomaster/discovery/scratchpads/idea-ghost/";
    const outcome = await runResearchStart(root, { topic: "t", host: ghost });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("RESEARCH_HOST_NOT_FOUND");
    expect(existsSync(join(root, ...`${ghost}research/`.split("/")))).toBe(false);
  });

  it("task 目录宿主（tasks/TASK.T0087/ 已存在）→ 合法（登记面第二形，非恒真对照）", async () => {
    mkdirSync(join(root, "tasks", "TASK.T0087"), { recursive: true });
    const outcome = await runResearchStart(root, {
      topic: "grid 选型",
      host: "tasks/TASK.T0087/",
    });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as ResearchStartResult).artifact_root).toBe(
      "tasks/TASK.T0087/research/",
    );
    expect(existsSync(join(root, "tasks", "TASK.T0087", "research", "index.yaml"))).toBe(true);
  });
});

describe("research list（§44.3）", () => {
  it("宿主不存在 = RESEARCH_HOST_NOT_FOUND（显式错误，区别于空清单）", async () => {
    const outcome = await runResearchList(root, ".pomaster/discovery/scratchpads/nope/");
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("RESEARCH_HOST_NOT_FOUND");
  });

  it("宿主存在无产物 = ok 空清单（显式空）；有 artifact 呈现 findings 计数与 SKELETON 标记", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-l/";
    await runBrainstormStart(root, { id: "idea-l" });
    const empty = await runResearchList(root, host);
    expect(empty.ok).toBe(true);
    expect((empty.result as ResearchListResult).artifacts).toEqual([]);

    await runResearchStart(root, { topic: "t", host });
    const listing = await runResearchList(root, host);
    expect(listing.ok).toBe(true);
    const artifacts = (listing.result as ResearchListResult).artifacts;
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.findings_count).toBe(0);
    expect(artifacts[0]?.skeleton).toBe(true);
  });

  it("宿主词形非法（绝对盘符）→ SCHEMA_INVALID", async () => {
    const outcome = await runResearchList(root, "D:\\tmp");
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});

describe("research inspect（§44.3；§81.4 判卷呈现）", () => {
  it("缺 index.yaml → RESEARCH_ARTIFACT_NOT_FOUND；research-id 词形外 → SCHEMA_INVALID", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-i/";
    await runBrainstormStart(root, { id: "idea-i" });
    const missing = await runResearchInspect(root, `${host}research/`);
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("RESEARCH_ARTIFACT_NOT_FOUND");

    const badShape = await runResearchInspect(root, "src/pages/");
    expect(badShape.ok).toBe(false);
    expect(badShape.errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("自由手写 yaml（非 JSON 兼容）→ INDEX_NOT_MACHINE_PARSEABLE（不静默猜结构）", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-yaml/";
    await runBrainstormStart(root, { id: "idea-yaml" });
    const outcome = await runResearchStart(root, { topic: "t", host });
    expect(outcome.ok).toBe(true);
    // 骨架存在后覆写为自由 yaml（JSON 不兼容：无引号键 + yaml 锚语法形态）。
    const fs = await import("node:fs");
    fs.writeFileSync(
      join(researchDirOf(host), "index.yaml"),
      "---\nhost_ref: unwrapped\nfindings:\n  - *anchor\n",
      "utf8",
    );
    const inspect = await runResearchInspect(root, `${host}research/`);
    expect(inspect.ok).toBe(false);
    expect(inspect.errors[0]?.code).toBe("INDEX_NOT_MACHINE_PARSEABLE");
  });

  it("对抗（B3）：findings 键存在但非数组 → INDEX_NOT_MACHINE_PARSEABLE exit 1（字段级损坏不折叠为空分母假绿）", async () => {
    // 若防御失效：`Array.isArray(findings) ? findings : []` 把「键存在但非数组」
    // 静默折叠为空数组 → 分母 0 → all_ok 假绿 exit 0（与合法空 findings 不可区分；
    // 条目级损坏有 FINDING_MALFORMED 防线，字段级整体损坏恰好绕过）。
    const host = ".pomaster/discovery/scratchpads/idea-f-broken/";
    await runBrainstormStart(root, { id: "idea-f-broken" });
    await runResearchStart(root, { topic: "t", host });
    const indexPath = join(researchDirOf(host), "index.yaml");
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as Record<string, unknown>;
    index.findings = "corrupted-not-an-array";
    (await import("node:fs")).writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    const outcome = await runResearchInspect(root, `${host}research/`);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("INDEX_NOT_MACHINE_PARSEABLE");
    expect(outcome.errors[0]?.message).toContain("findings");
    expect(outcome.errors[0]?.message).toContain("损坏");
    expect(outcome.errors[0]?.hint).toContain("缺席");
  });

  it("非恒真对照（B3）：findings 键真缺席 → 仍走空分母骨架警示通路（合法缺席不误伤）", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-f-absent/";
    await runBrainstormStart(root, { id: "idea-f-absent" });
    await runResearchStart(root, { topic: "t", host });
    const indexPath = join(researchDirOf(host), "index.yaml");
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as Record<string, unknown>;
    delete index.findings;
    (await import("node:fs")).writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    const outcome = await runResearchInspect(root, `${host}research/`);
    expect(outcome.ok).toBe(true);
    const result = outcome.result as ResearchInspectResult;
    expect(result.findings_total).toBe(0);
    expect(outcome.warnings.map((w) => w.code)).toContain("RESEARCH_SKELETON");
  });

  it("骨架：四文件齐 + findings 空 + SKELETON warning + ok（骨架是合法中间态）", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-skel/";
    await runBrainstormStart(root, { id: "idea-skel" });
    await runResearchStart(root, { topic: "t", host });
    const outcome = await runResearchInspect(root, `${host}research/index.yaml`);
    expect(outcome.ok).toBe(true);
    const result = outcome.result as ResearchInspectResult;
    expect(result.files.every((f) => f.present)).toBe(true);
    expect(result.findings_total).toBe(0);
    expect(result.skeleton).toBe(true);
    expect(outcome.warnings.map((w) => w.code)).toContain("RESEARCH_SKELETON");
  });

  it("词表外 finding（evidence_type=社区博客）→ RESEARCH_FINDING_INVALID exit 语义", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-invalid/";
    await runBrainstormStart(root, { id: "idea-invalid" });
    await runResearchStart(root, { topic: "t", host });
    const indexPath = join(researchDirOf(host), "index.yaml");
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
      findings: unknown[];
      handoff: { one_line_summary: string; critical_caveat: string };
    };
    index.findings = [
      {
        statement: "某博客说 grid 该这样用",
        evidence_type: "社区博客文章",
        sources: [],
        confidence: "LOW",
        authority_effect: "NONE",
        caveats: [],
      },
    ];
    index.handoff = {
      ...index.handoff,
      one_line_summary: "一无所获（诚实结论）",
    };
    (await import("node:fs")).writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    const outcome = await runResearchInspect(root, `${host}research/`);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("RESEARCH_FINDING_INVALID");
    expect(outcome.errors[0]?.message).toContain("EVIDENCE_LEVEL_UNKNOWN");
  });

  it("CONFLICTS finding：ok（发现是合法的）+ escalation warning（上报正式治理面，不是裁决）", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-conflict/";
    await runBrainstormStart(root, { id: "idea-conflict" });
    await runResearchStart(root, { topic: "t", host });
    const indexPath = join(researchDirOf(host), "index.yaml");
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
      findings: unknown[];
      handoff: { one_line_summary: string };
    };
    index.findings = [
      {
        statement: "现有实现与 ARCH 规定的 Single HTTP Client 冲突",
        evidence_type: "IMPLEMENTATION",
        sources: ["src/http.ts"],
        confidence: "HIGH",
        authority_effect: "CONFLICTS",
        caveats: ["冲突是发现不是裁决，待正式治理面裁定"],
      },
    ];
    index.handoff = { ...index.handoff, one_line_summary: "发现一处与架构契约冲突的实现" };
    (await import("node:fs")).writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    const outcome = await runResearchInspect(root, `${host}research/`);
    expect(outcome.ok).toBe(true);
    expect(outcome.warnings.map((w) => w.code)).toContain("RESEARCH_CONFLICTS_ESCALATION");
    expect(outcome.warnings.find((w) => w.code === "RESEARCH_CONFLICTS_ESCALATION")?.hint).toContain(
      "治理面",
    );
    const result = outcome.result as ResearchInspectResult;
    expect(result.adjudication?.escalations).toBe(1);
  });

  it("IMPLEMENTATION+SUPPORTS 未对账 → 降信 warning（§81.5）", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-supports/";
    await runBrainstormStart(root, { id: "idea-supports" });
    await runResearchStart(root, { topic: "t", host });
    const indexPath = join(researchDirOf(host), "index.yaml");
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
      findings: unknown[];
      handoff: { one_line_summary: string };
    };
    index.findings = [
      {
        statement: "三处 MasterGrid 使用点证明官方标准",
        evidence_type: "IMPLEMENTATION",
        sources: ["src/pages/list.vue", "src/pages/task/grid.vue"],
        confidence: "HIGH",
        authority_effect: "SUPPORTS",
        caveats: ["三处使用点尚不构成标准结论"],
      },
    ];
    index.handoff = { ...index.handoff, one_line_summary: "存在性不构成标准结论" };
    (await import("node:fs")).writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    const outcome = await runResearchInspect(root, `${host}research/`);
    expect(outcome.warnings.map((w) => w.code)).toContain("RESEARCH_FINDING_WARNING");
    expect(
      outcome.warnings.find((w) => w.code === "RESEARCH_FINDING_WARNING")?.hint,
    ).toContain("降信");
  });

  it("四文件被删一个 → RESEARCH_ARTIFACT_INCOMPLETE（§81.6 产物契约 fail-closed）", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-missing/";
    await runBrainstormStart(root, { id: "idea-missing" });
    await runResearchStart(root, { topic: "t", host });
    (await import("node:fs")).rmSync(join(researchDirOf(host), "risks-and-caveats.md"));
    const outcome = await runResearchInspect(root, `${host}research/`);
    expect(outcome.ok).toBe(false);
    expect(outcome.human.join()).toContain("ARTIFACT_INCOMPLETE");
    expect(outcome.human.join()).toContain("risks-and-caveats.md");
  });

  it("对抗（发现1 钉子）：AUTHORITATIVE 零 sources/零 caveats → RESEARCH_FINDING_INVALID + all_ok=false（幻觉洗白不放行）", async () => {
    // 若防御失效：AUTHORITATIVE 级零来源 finding 经 inspect 全链放行（exit 0/all_ok=
    // true）——幻觉断言借最高证据级洗白进 handoff，§81.4 六字段取证契约形同虚设。
    const host = ".pomaster/discovery/scratchpads/idea-hallucination/";
    await runBrainstormStart(root, { id: "idea-hallucination" });
    await runResearchStart(root, { topic: "t", host });
    const indexPath = join(researchDirOf(host), "index.yaml");
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
    (await import("node:fs")).writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    const outcome = await runResearchInspect(root, `${host}research/`);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("RESEARCH_FINDING_INVALID");
    const messages = outcome.errors.map((e) => e.message).join("|");
    expect(messages).toContain("SOURCES_EMPTY");
    expect(messages).toContain("CAVEATS_EMPTY");
    const result = outcome.result as ResearchInspectResult;
    expect(result.adjudication?.all_ok).toBe(false);
    expect(result.adjudication?.violations).toBeGreaterThanOrEqual(2);
  });

  it("对抗（发现1）：sources/caveats 字段整体缺失（六字段 required）→ SOURCES_MISSING/CAVEATS_MISSING", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-absent/";
    await runBrainstormStart(root, { id: "idea-absent" });
    await runResearchStart(root, { topic: "t", host });
    const indexPath = join(researchDirOf(host), "index.yaml");
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
      findings: unknown[];
      handoff: { one_line_summary: string };
    };
    index.findings = [
      {
        statement: "六字段缺两",
        evidence_type: "PRIMARY",
        confidence: "MEDIUM",
        authority_effect: "NONE",
      },
    ];
    index.handoff = { ...index.handoff, one_line_summary: "缺字段结论" };
    (await import("node:fs")).writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    const outcome = await runResearchInspect(root, `${host}research/`);
    expect(outcome.ok).toBe(false);
    const messages = outcome.errors.map((e) => e.message).join("|");
    expect(messages).toContain("SOURCES_MISSING");
    expect(messages).toContain("CAVEATS_MISSING");
  });

  it("非恒真对照（发现1）：INFERENCE 空 sources 豁免 + caveats 非空 → ok（判卷器不是全拒恒真）", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-inference/";
    await runBrainstormStart(root, { id: "idea-inference" });
    await runResearchStart(root, { topic: "t", host });
    const indexPath = join(researchDirOf(host), "index.yaml");
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
      findings: unknown[];
      handoff: { one_line_summary: string };
    };
    index.findings = [
      {
        statement: "综合既有证据推断 grid 选型倾向",
        evidence_type: "INFERENCE",
        sources: [],
        confidence: "LOW",
        authority_effect: "NONE",
        caveats: ["推断自既有证据组合，非独立来源"],
      },
    ];
    index.handoff = { ...index.handoff, one_line_summary: "推断性结论（低置信）" };
    (await import("node:fs")).writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    const outcome = await runResearchInspect(root, `${host}research/`);
    expect(outcome.ok).toBe(true);
    const result = outcome.result as ResearchInspectResult;
    expect(result.adjudication?.all_ok).toBe(true);
  });

  it("形态不完整 finding（缺 evidence_type）→ FINDING_MALFORMED error（不静默跳出判卷分母）", async () => {
    const host = ".pomaster/discovery/scratchpads/idea-malformed/";
    await runBrainstormStart(root, { id: "idea-malformed" });
    await runResearchStart(root, { topic: "t", host });
    const indexPath = join(researchDirOf(host), "index.yaml");
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
      findings: unknown[];
      handoff: { one_line_summary: string };
    };
    index.findings = [{ statement: "垃圾条目缺 evidence_type" }];
    index.handoff = { ...index.handoff, one_line_summary: "形态残缺" };
    (await import("node:fs")).writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    const outcome = await runResearchInspect(root, `${host}research/`);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("RESEARCH_FINDING_INVALID");
    expect(outcome.errors[0]?.message).toContain("FINDING_MALFORMED");
    const result = outcome.result as ResearchInspectResult;
    expect(result.findings_total).toBe(0);
  });

  it("对抗（发现4）：research-id 宿主位 .. 逃逸 → SCHEMA_INVALID（../../ 穿透读仓外封死）", async () => {
    const outcome = await runResearchInspect(root, "../../evil/research/");
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("宿主位");
  });

  it("对抗（发现4）：宿主目录不存在 → RESEARCH_HOST_NOT_FOUND（与 list 同款存在性校验）", async () => {
    const outcome = await runResearchInspect(
      root,
      ".pomaster/discovery/scratchpads/idea-ghost/research/",
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("RESEARCH_HOST_NOT_FOUND");
  });
});
