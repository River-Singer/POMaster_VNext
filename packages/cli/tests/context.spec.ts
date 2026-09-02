/**
 * context.spec.ts —— 八拍③命令面：kernel 转调、三分区 markdown、缺席显式。
 *
 * TODO(integration-2026-08-28)：kernel 模块已由 kernel 建造者落地。原「kernel
 * scaffold（not-implemented）→ KERNEL_NOT_INSTALLED」真实 kernel 场景已不存在
 * （CLI 设计即"kernel 落地后本命令自动升级，无需改动"），该用例更新为真实 kernel
 * 集成断言；scaffold 时代的错误分类路径由注入式用例（本文件"注入形态"用例）继续覆盖。
 */
import { rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogProjectionExplanation, Projection, Store } from "@pomaster/kernel";
import { runInit, runContextCompile, runContextExplain } from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-context-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function fakeProjection(overrides?: Partial<Projection>): Projection {
  return {
    manifest: {
      mustEntries: [{ ref: "POLICY.PAGE.TTL", reason: "本任务触碰 PAGE.* 分母" }],
      advisoryEntries: [
        { ref: "KNOWLEDGE.KB_GRID", reason: "触发条件：任务涉及表格" },
      ],
      catalogEntries: [
        {
          ref: "POLICY.WEB.API.SINGLE_HTTP_CLIENT",
          reason:
            "catalog: policies/policy.web.api.single_http_client.json（lane=frontend 命中 role=frontend，enforcement=required_when_applicable，lifecycle=PROPOSED）：HTTP Client 单点统一",
        },
      ],
      knowledgeEntries: [
        {
          ref: "KNOWLEDGE.FE.DASH.STACK_CLIP",
          reason:
            "ADVISORY: knowledge 检索命中（§83.8「按 Change Localization 检索注入」；命中 token: dashboard；出处 knowledge-library: .pomaster/state/knowledge-library.json）——不进 gate 判卷输入（GOLDEN-L8-3；knowledge 恒 ADVISORY，§83.2 铁律）",
        },
      ],
      lazyTools: ["playwright"],
    },
    catalogSource: {
      status: "catalog",
      root: "/repo/catalog",
      note: "catalog-lock 校验通过（100 entries）",
    },
    inputsFingerprint: "sha256:" + "a".repeat(64),
    ...overrides,
  };
}

function fakeKernel(projection: Projection) {
  const compileProjection = vi.fn(async () => projection);
  const createStore = vi.fn(async (root: string) => ({ rootDir: root, currentSeq: 0 }) as Store);
  return { createStore, compileProjection };
}

describe("context compile 缺席显式", () => {
  it("未初始化 → NOT_INITIALIZED（禁静默投影）", async () => {
    const outcome = await runContextCompile(dir, "frontend");
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
  });

  it("init 后（真实 kernel 已落地）→ 编译成功：五分区标题在场、空区显式缺席、catalog 分区真消费 repo catalog", async () => {
    await runInit(dir);
    const outcome = await runContextCompile(dir, "frontend");
    expect(outcome.ok).toBe(true);
    expect(outcome.result.markdown).toContain(
      "# Context Projection — role: frontend",
    );
    expect(outcome.result.markdown).toContain("## MUST（[AUTHORITATIVE] gate 判卷输入）");
    expect(outcome.result.markdown).toContain("无 MUST 注入项");
    expect(outcome.result.markdown).toContain(
      "## KNOWLEDGE（[ADVISORY] 知识检索注入；出处 state/knowledge-library.json——§83.8 检索而非全量注入）",
    );
    expect(outcome.result.markdown).toContain("检索而非全量注入");
    expect(outcome.result.markdown).toContain("## CATALOG（catalog 策展注入；出处 catalog，非 project state——§92.2）");
    // P14：catalog 分区真实消费 repo catalog（frontend lane 命中非空 + lock 注记）。
    expect(outcome.result.catalog_source.status).toBe("catalog");
    expect(outcome.result.manifest.catalog_entries.length).toBeGreaterThan(0);
    expect(outcome.result.manifest.catalog_entries[0]?.reason.startsWith("catalog:")).toBe(true);
    expect(outcome.errors).toEqual([]);
  });
});

describe("context compile 转调 kernel（注入 fake）", () => {
  it("五分区 markdown：MUST / ADVISORY / KNOWLEDGE / CATALOG / LAZY TOOLS 标题与条目（§83.8 分区词形逐字）", async () => {
    await runInit(dir);
    const kernel = fakeKernel(fakeProjection());
    const outcome = await runContextCompile(dir, "frontend", kernel);
    expect(outcome.ok).toBe(true);
    expect(kernel.compileProjection).toHaveBeenCalledOnce();
    expect(outcome.result.markdown).toContain("## MUST（[AUTHORITATIVE] gate 判卷输入）");
    expect(outcome.result.markdown).toContain("## ADVISORY（[ADVISORY] 按触发条件注入；不进 gate 判卷输入）");
    expect(outcome.result.markdown).toContain(
      "## KNOWLEDGE（[ADVISORY] 知识检索注入；出处 state/knowledge-library.json——§83.8 检索而非全量注入）",
    );
    expect(outcome.result.markdown).toContain("`KNOWLEDGE.FE.DASH.STACK_CLIP` — ADVISORY: knowledge 检索命中");
    expect(outcome.result.markdown).toContain("## CATALOG（catalog 策展注入；出处 catalog，非 project state——§92.2）");
    expect(outcome.result.markdown).toContain("## LAZY TOOLS");
    expect(outcome.result.markdown).toContain("`POLICY.PAGE.TTL` — 本任务触碰 PAGE.* 分母");
    expect(outcome.result.markdown).toContain("`POLICY.WEB.API.SINGLE_HTTP_CLIENT` — catalog: policies/");
    expect(outcome.result.markdown).toContain("- playwright");
  });

  it("catalog_source 呈现：root + lock 注记进 markdown（出处显式，§92.2）", async () => {
    await runInit(dir);
    const outcome = await runContextCompile(dir, "frontend", fakeKernel(fakeProjection()));
    expect(outcome.result.markdown).toContain("> source: /repo/catalog");
    expect(outcome.result.markdown).toContain("> catalog-lock 校验通过（100 entries）");
    expect(outcome.result.catalog_source.status).toBe("catalog");
  });

  it("role 透传 kernel；inputs_fingerprint 原样回显", async () => {
    await runInit(dir);
    const kernel = fakeKernel(fakeProjection());
    const outcome = await runContextCompile(dir, "architect", kernel);
    expect(kernel.compileProjection.mock.calls[0]?.[1]).toEqual({
      role: "architect",
    });
    expect(outcome.result.role).toBe("architect");
    expect(outcome.result.inputs_fingerprint).toBe("sha256:" + "a".repeat(64));
  });

  it("manifest 字段机读映射（must/advisory/catalog/knowledge_entries/lazy_tools）", async () => {
    await runInit(dir);
    const outcome = await runContextCompile(dir, "frontend", fakeKernel(fakeProjection()));
    expect(outcome.result.manifest.must_entries).toEqual([
      { ref: "POLICY.PAGE.TTL", reason: "本任务触碰 PAGE.* 分母" },
    ]);
    expect(outcome.result.manifest.catalog_entries).toEqual([
      {
        ref: "POLICY.WEB.API.SINGLE_HTTP_CLIENT",
        reason:
          "catalog: policies/policy.web.api.single_http_client.json（lane=frontend 命中 role=frontend，enforcement=required_when_applicable，lifecycle=PROPOSED）：HTTP Client 单点统一",
      },
    ]);
    expect(outcome.result.manifest.knowledge_entries).toHaveLength(1);
    expect(outcome.result.manifest.knowledge_entries[0]?.ref).toBe("KNOWLEDGE.FE.DASH.STACK_CLIP");
    expect(outcome.result.manifest.lazy_tools).toEqual(["playwright"]);
  });

  it("空 manifest → markdown 显式标注空区（缺席显式，不渲染成有内容；knowledge 空区含检索而非全量措辞）", async () => {
    await runInit(dir);
    const empty = fakeProjection({
      manifest: {
        mustEntries: [],
        advisoryEntries: [],
        catalogEntries: [],
        knowledgeEntries: [],
        lazyTools: [],
      },
    });
    const outcome = await runContextCompile(dir, "designer", fakeKernel(empty));
    expect(outcome.ok).toBe(true);
    expect(outcome.result.markdown).toContain("无 MUST 注入项");
    expect(outcome.result.markdown).toContain("无触发条件命中");
    expect(outcome.result.markdown).toContain("无 Change Localization 检索命中的知识条目");
    expect(outcome.result.markdown).toContain("无 lane 命中的 catalog 条目");
  });

  it("kernel 抛非 not-implemented 错误 → KERNEL_ERROR（带原消息）", async () => {
    await runInit(dir);
    const outcome = await runContextCompile(dir, "frontend", {
      createStore: async () => {
        throw new Error("disk exploded");
      },
      compileProjection: async () => {
        throw new Error("unreachable");
      },
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("KERNEL_ERROR");
    expect(outcome.errors[0]?.message).toContain("disk exploded");
  });

  it("kernel 抛 not-implemented（注入形态）→ KERNEL_NOT_INSTALLED", async () => {
    await runInit(dir);
    const outcome = await runContextCompile(dir, "frontend", {
      createStore: async () => {
        throw new Error("not-implemented");
      },
      compileProjection: async () => {
        throw new Error("not-implemented");
      },
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("KERNEL_NOT_INSTALLED");
  });
});

// ============================================================
// P0.5-1：compile applicability 输入透传 + context explain 决策记录面
// ============================================================

describe("context compile applicability 输入（P0.5-1）", () => {
  it("inputs 透传 kernel（change→taskRef / capabilities / changeClass / governanceProfile）", async () => {
    await runInit(dir);
    const kernel = fakeKernel(fakeProjection());
    const outcome = await runContextCompile(
      dir,
      "frontend",
      kernel,
      {
        change: "CHANGE.C0042",
        capabilities: ["CAPABILITY.PRESENTATION"],
        changeClass: "PRESENTATION_CHANGE",
        governanceProfile: "MINIMAL",
      },
    );
    expect(outcome.ok).toBe(true);
    expect(kernel.compileProjection.mock.calls[0]?.[1]).toEqual({
      role: "frontend",
      taskRef: "CHANGE.C0042",
      capabilities: ["CAPABILITY.PRESENTATION"],
      changeClass: "PRESENTATION_CHANGE",
      governanceProfile: "MINIMAL",
    });
    // 输入回显（机读面 snake_case；缺席显式）。
    expect(outcome.result.applicability).toEqual({
      change: "CHANGE.C0042",
      capabilities: ["CAPABILITY.PRESENTATION"],
      change_class: "PRESENTATION_CHANGE",
      governance_profile: "MINIMAL",
    });
  });

  it("无输入时 markdown 零新增行（O7 输入面字节零变化）；有输入时 applicability 行在场", async () => {
    await runInit(dir);
    const kernel = fakeKernel(fakeProjection());
    const plain = await runContextCompile(dir, "frontend", kernel);
    expect(plain.result.markdown).not.toContain("applicability:");
    const withInput = await runContextCompile(
      dir,
      "frontend",
      fakeKernel(fakeProjection()),
      { capabilities: ["CAPABILITY.PRESENTATION"], changeClass: "PRESENTATION_CHANGE" },
    );
    expect(withInput.result.markdown).toContain(
      "> applicability: capabilities=CAPABILITY.PRESENTATION；change_class=PRESENTATION_CHANGE",
    );
  });

  it("kernel 词形拒绝 → KERNEL_ERROR 透传原消息（fail-closed 命令面；真实 kernel 校验，注入 fake 会绕过判卷）", async () => {
    await runInit(dir);
    const outcome = await runContextCompile(dir, "frontend", undefined, {
      changeClass: "NOT_A_CLASS",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("KERNEL_ERROR");
    expect(outcome.errors[0]?.message).toContain("changeClass 词表外");
  });
});

describe("context explain（P0.5-1 决策记录面；PRD §5.4）", () => {
  function fakeExplanation(): CatalogProjectionExplanation {
    return {
      inputs: {
        role: "frontend",
        taskRef: null,
        capabilities: ["CAPABILITY.PRESENTATION"],
        changeClass: null,
        governanceProfile: null,
      },
      decisions: [
        {
          ref: "POLICY.WEB.STYLE.OWNERSHIP_MATRIX",
          file: "policies/policy.web.style.ownership_matrix.json",
          decision: "included",
          why_included:
            "lane=frontend 命中 role=frontend（未声明机器 applicability 字段——lane 回退判定，O7）",
          why_excluded: null,
          matched: { lane: ["frontend"] },
          fallback_lane: true,
        },
        {
          ref: "POLICY.WEB.API.SINGLE_HTTP_CLIENT",
          file: "policies/policy.web.api.single_http_client.json",
          decision: "excluded",
          why_included: null,
          why_excluded:
            "未命中（capabilities=[CAPABILITY.API_CONTRACT] 与请求 capabilities=[CAPABILITY.PRESENTATION] 无交集）",
          matched: { lanes: ["frontend"] },
          fallback_lane: false,
        },
      ],
      catalogSource: {
        status: "catalog",
        root: "/repo/catalog",
        note: "catalog-lock 校验通过（94 entries）",
      },
    };
  }

  function fakeExplainKernel(explanation: CatalogProjectionExplanation) {
    const explainCatalogProjection = vi.fn(async () => explanation);
    const createStore = vi.fn(async (root: string) => ({ rootDir: root, currentSeq: 0 }) as Store);
    return { createStore, explainCatalogProjection };
  }

  it("include/exclude 逐条 why 渲染（PRD §5.4 词形逐字）+ 输入透传", async () => {
    await runInit(dir);
    const kernel = fakeExplainKernel(fakeExplanation());
    const outcome = await runContextExplain(
      dir,
      "frontend",
      kernel,
      { capabilities: ["CAPABILITY.PRESENTATION"] },
    );
    expect(outcome.ok).toBe(true);
    expect(kernel.explainCatalogProjection.mock.calls[0]?.[1]).toEqual({
      role: "frontend",
      capabilities: ["CAPABILITY.PRESENTATION"],
    });
    expect(outcome.result.decisions).toHaveLength(2);
    expect(outcome.result.markdown).toContain(
      "# Context Explain — catalog include/exclude（PRD §5.4 决策记录面）",
    );
    expect(outcome.result.markdown).toContain("## INCLUDED（1）");
    expect(outcome.result.markdown).toContain("## EXCLUDED（1）");
    expect(outcome.result.markdown).toContain(
      "`POLICY.WEB.STYLE.OWNERSHIP_MATRIX` — why_included: lane=frontend 命中 role=frontend",
    );
    expect(outcome.result.markdown).toContain(
      "`POLICY.WEB.API.SINGLE_HTTP_CLIENT` — why_excluded: 未命中（capabilities=",
    );
    // 隔离注记在场（excluded 不进 Agent Context——PRD §5.4 明文）。
    expect(outcome.result.markdown).toContain("excluded 不进五分区 manifest");
  });

  it("真实 kernel：repo catalog 全量决策逐条可解释（T3 标注后 excluded 显式非空）", async () => {
    await runInit(dir);
    const outcome = await runContextExplain(dir, "frontend", undefined, {
      capabilities: ["CAPABILITY.PRESENTATION"],
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.catalog_source.status).toBe("catalog");
    const included = outcome.result.decisions.filter((d) => d.decision === "included");
    const excluded = outcome.result.decisions.filter((d) => d.decision === "excluded");
    expect(included.length).toBeGreaterThan(0);
    // W1-A2 T3 标注战役后（PRD v0.5.2 §5.2/§14；裁决 8 ②）：capabilities=[PRESENTATION]
    // 输入下 API/Sec 族（capabilities=[CAPABILITY.API_CONTRACT] 标注条目）被确定性排除——
    // excluded 非空是标注生效的诚实结果（批1时「94 条全未标注 → excluded 为空」的前提
    // 已被 T3 消解；O7 行为零变化只保未标注条目，棘轮见 case-b spec 的 O7 describe）。
    expect(excluded.length).toBeGreaterThan(0);
    expect(
      excluded.every((d) => d.why_excluded?.includes("未命中（")),
    ).toBe(true);
    for (const decision of outcome.result.decisions) {
      if (decision.decision === "included") {
        expect(decision.why_included).toBeTruthy();
        expect(decision.why_excluded).toBeNull();
      } else {
        expect(decision.why_excluded).toBeTruthy();
        expect(decision.why_included).toBeNull();
      }
    }
  });

  it("未初始化 → NOT_INITIALIZED（缺席显式，与 compile 同款）", async () => {
    const outcome = await runContextExplain(dir, "frontend");
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
  });
});
