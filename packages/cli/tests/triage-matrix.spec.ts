/**
 * triage-matrix.spec.ts —— P15-FillB：Router 判定矩阵域补量（逐词形/逐边界一测）。
 *
 * 矩阵行来源（triage.ts 判定顺序：升档触发 → 短路快道 → 兜底缺省，拒绝加权求和）：
 * - E_CONTRACT_KEYWORD（STANDARD/INFERRED）：TRIAGE_ESCALATION_KEYWORDS 7 词形逐词；
 * - F_COPY_STYLE_ONLY（MINIMAL/MEASURED）：TRIAGE_COPY_STYLE_KEYWORDS 13 词形逐词；
 * - DEFAULT_NO_SIGNAL（LIGHT/NOT_CONFIGURED）：无命中兜底与词形精确性边界。
 * 每条用例对应 triageRequest 的真实判定行或词表字面项（词形级 Eval 载体，
 * 「每条规则可单测可入 Eval」——triage.ts TriageResult.matched_rule 注）；
 * 词表字面锁定测试是 TODO(vocab-pr) 扩词纪律的机器化：扩词必须显式改测试。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TRIAGE_ABSENT_SIGNALS,
  TRIAGE_COPY_STYLE_KEYWORDS,
  TRIAGE_EVIDENCE_GRADES,
  TRIAGE_ESCALATION_KEYWORDS,
  TRIAGE_PROFILES,
  TriageResult,
  runCli,
  triageRequest,
  type CliEnvelope,
} from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-triage-matrix-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** 断言一次判定恰好落在指定矩阵行（profile/evidence_grade/matched_rule 三元组）。 */
function expectRow(result: TriageResult, profile: string, grade: string, rule: string): void {
  expect(result.profile).toBe(profile);
  expect(result.evidence_grade).toBe(grade);
  expect(result.matched_rule).toBe(rule);
}

// ============================================================
// E_CONTRACT_KEYWORD：升档词表逐词与词形边界
// ============================================================

describe("Router 判定矩阵——升档触发 E_CONTRACT_KEYWORD 逐词形", () => {
  it("api_req 词形 → STANDARD / INFERRED（词表项实锚）", () => {
    const r = triageRequest("重构 api_req 字段命名");
    expectRow(r, "STANDARD", "INFERRED", "E_CONTRACT_KEYWORD");
    expect(r.matched_keywords).toEqual(["api_req"]);
  });

  it("cross-domain 词形 → STANDARD / INFERRED（词表项实锚）", () => {
    const r = triageRequest("调整 cross-domain 跳转行为");
    expectRow(r, "STANDARD", "INFERRED", "E_CONTRACT_KEYWORD");
    expect(r.matched_keywords).toEqual(["cross-domain"]);
  });

  it("词表 7 词逐词全扫：每词命中升档分支（词表 ↔ 判定行为一致性；新增词条自动获得升档行为）", () => {
    expect(TRIAGE_ESCALATION_KEYWORDS.length).toBe(7);
    for (const keyword of TRIAGE_ESCALATION_KEYWORDS) {
      expectRow(triageRequest(keyword), "STANDARD", "INFERRED", "E_CONTRACT_KEYWORD");
    }
  });

  it("matched_keywords 去重：同词形重复出现只计一次（collectKeywords !includes 判定行）", () => {
    const r = triageRequest("contract contract 契约 contract 三处提及");
    expect(r.matched_keywords).toEqual(["contract", "契约"]);
  });

  it("matched_keywords 保序 = 词表序而非文本出现序（api_req 在文本先现仍排词表位之后）", () => {
    const r = triageRequest("api_req 引入 contract 与 openapi 双源依赖");
    expect(r.matched_keywords).toEqual(["contract", "openapi", "api_req"]);
  });

  it("英文词形大小写不敏感：OpenAPI / Cross-Domain / GLOBAL / API_REQ 全部命中（includesKeyword 双侧 toLowerCase）", () => {
    for (const variant of ["OpenAPI", "Cross-Domain", "GLOBAL", "API_REQ"]) {
      expect(triageRequest(`调整 ${variant} 行为`).profile).toBe("STANDARD");
    }
  });

  it("中文「全局」不升档 → LIGHT（T-1 只批英文词形 global；中文 0 命中未提案，不投机扩词）", () => {
    const r = triageRequest("全局导航信息架构调整");
    expectRow(r, "LIGHT", "NOT_CONFIGURED", "DEFAULT_NO_SIGNAL");
  });

  it("「全局」+文案词 → MINIMAL 而非 STANDARD（中文全局走短路快道；与英文 global 样式→STANDARD 形成词形对照）", () => {
    const r = triageRequest("全局样式统一调整");
    expectRow(r, "MINIMAL", "MEASURED", "F_COPY_STYLE_ONLY");
  });

  it("复数词形经子串命中：contracts 含 contract → STANDARD（includes 子串语义）", () => {
    const r = triageRequest("review the payment contracts");
    expectRow(r, "STANDARD", "INFERRED", "E_CONTRACT_KEYWORD");
  });
});

// ============================================================
// F_COPY_STYLE_ONLY：短路快道逐词形与子串边界
// ============================================================

describe("Router 判定矩阵——短路快道 F_COPY_STYLE_ONLY 逐词形", () => {
  it("样式 → MINIMAL / MEASURED", () => {
    expectRow(triageRequest("统一空态样式口径"), "MINIMAL", "MEASURED", "F_COPY_STYLE_ONLY");
  });

  it("配色 → MINIMAL / MEASURED", () => {
    expectRow(triageRequest("配色改为暖色系"), "MINIMAL", "MEASURED", "F_COPY_STYLE_ONLY");
  });

  it("字体 → MINIMAL / MEASURED", () => {
    expectRow(triageRequest("正文字体号放大一档"), "MINIMAL", "MEASURED", "F_COPY_STYLE_ONLY");
  });

  it("颜色 → MINIMAL / MEASURED", () => {
    expectRow(triageRequest("按钮颜色改为品牌蓝"), "MINIMAL", "MEASURED", "F_COPY_STYLE_ONLY");
  });

  it("间距 → MINIMAL / MEASURED", () => {
    expectRow(triageRequest("调整列表行间距"), "MINIMAL", "MEASURED", "F_COPY_STYLE_ONLY");
  });

  it("图标 → MINIMAL / MEASURED", () => {
    expectRow(triageRequest("图标改为线性风格"), "MINIMAL", "MEASURED", "F_COPY_STYLE_ONLY");
  });

  it("注释 → MINIMAL / MEASURED", () => {
    expectRow(triageRequest("补一段字段使用注释"), "MINIMAL", "MEASURED", "F_COPY_STYLE_ONLY");
  });

  it("copy → MINIMAL / MEASURED", () => {
    expectRow(triageRequest("update the banner copy"), "MINIMAL", "MEASURED", "F_COPY_STYLE_ONLY");
  });

  it("style → MINIMAL / MEASURED", () => {
    expectRow(triageRequest("tweak the hover style"), "MINIMAL", "MEASURED", "F_COPY_STYLE_ONLY");
  });

  it("comment → MINIMAL / MEASURED", () => {
    expectRow(triageRequest("fix the stale comment"), "MINIMAL", "MEASURED", "F_COPY_STYLE_ONLY");
  });

  it("词表 13 词逐词全扫：每词命中短路分支（词表 ↔ 判定行为一致性）", () => {
    expect(TRIAGE_COPY_STYLE_KEYWORDS.length).toBe(13);
    for (const keyword of TRIAGE_COPY_STYLE_KEYWORDS) {
      expectRow(triageRequest(keyword), "MINIMAL", "MEASURED", "F_COPY_STYLE_ONLY");
    }
  });

  it("多文案词命中全列且保序 = 词表序（字体先现仍排样式之后）", () => {
    const r = triageRequest("字体 样式 两处微调");
    expect(r.matched_keywords).toEqual(["样式", "字体"]);
  });

  it("复数/派生词形经子串命中：styles / comments / copywriting 分别命中 style / comment / copy", () => {
    const r = triageRequest("styles 与 comments 与 copywriting 的拼写检查");
    expect(r.matched_keywords).toEqual(["copy", "style", "comment"]);
  });

  it("typography 含 typo 子串 → MINIMAL（子串命中不分词边界）", () => {
    expectRow(triageRequest("typography tweaks"), "MINIMAL", "MEASURED", "F_COPY_STYLE_ONLY");
  });

  it("styling 不含 style 子串 → LIGHT 兜底（近似词形不投机命中：s-t-y-l-i-n-g 无 style）", () => {
    expectRow(triageRequest("restyling the widget"), "LIGHT", "NOT_CONFIGURED", "DEFAULT_NO_SIGNAL");
  });

  it("英文 color 不在词表 → LIGHT（词表只有中文「颜色」；扩词须走 TODO(vocab-pr)，不投机同义扩）", () => {
    expectRow(triageRequest("adjust color palette"), "LIGHT", "NOT_CONFIGURED", "DEFAULT_NO_SIGNAL");
  });
});

// ============================================================
// DEFAULT_NO_SIGNAL：兜底缺省与词形精确性边界
// ============================================================

describe("Router 判定矩阵——兜底缺省 DEFAULT_NO_SIGNAL 词形精确性", () => {
  it("api-req 连字符变体不命中 api_req → LIGHT（下划线词形精确性）", () => {
    expectRow(triageRequest("update api-req fields"), "LIGHT", "NOT_CONFIGURED", "DEFAULT_NO_SIGNAL");
  });

  it("cross domain 空格变体不命中 cross-domain → LIGHT（连字符词形精确性）", () => {
    expectRow(triageRequest("improve cross domain navigation"), "LIGHT", "NOT_CONFIGURED", "DEFAULT_NO_SIGNAL");
  });

  it("纯空白请求 → LIGHT 且命中词为空（无信号兜底不是绿）", () => {
    const r = triageRequest("   \t  ");
    expectRow(r, "LIGHT", "NOT_CONFIGURED", "DEFAULT_NO_SIGNAL");
    expect(r.matched_keywords).toEqual([]);
  });
});

// ============================================================
// 判定矩阵行语义：规则 → 档位 → 证据级绑定与词表纪律钉死
// ============================================================

describe("Router 判定矩阵——规则·档位·证据级绑定映射", () => {
  it("三行绑定映射钉死：E_CONTRACT_KEYWORD⇒(STANDARD,INFERRED)、F_COPY_STYLE_ONLY⇒(MINIMAL,MEASURED)、DEFAULT_NO_SIGNAL⇒(LIGHT,NOT_CONFIGURED)", () => {
    const expected: ReadonlyArray<readonly [string, string, string]> = [
      ["STANDARD", "INFERRED", "E_CONTRACT_KEYWORD"],
      ["MINIMAL", "MEASURED", "F_COPY_STYLE_ONLY"],
      ["LIGHT", "NOT_CONFIGURED", "DEFAULT_NO_SIGNAL"],
    ];
    const inputs = ["openapi 同步", "图标微调", "新增批量导入功能"];
    inputs.forEach((input, index) => {
      const [profile, grade, rule] = expected[index] as [string, string, string];
      expectRow(triageRequest(input), profile, grade, rule);
    });
  });

  it("判定顺序不变量：升档词在场时文案词再多也落 STANDARD（contract×样式 / global×文案 / cross-domain×css）", () => {
    for (const combo of ["样式微调涉及 contract 条款", "文案更新触发 global 发布", "css 重构 cross-domain 布局"]) {
      expect(triageRequest(combo).profile).toBe("STANDARD");
      expect(triageRequest(combo).matched_rule).toBe("E_CONTRACT_KEYWORD");
    }
  });

  it("matched_keywords 为空 ⇔ DEFAULT_NO_SIGNAL（非兜底分支必带非空命中，判定可解释锚）", () => {
    for (const input of ["openapi 同步", "图标微调", "新增批量导入功能", ""]) {
      const r = triageRequest(input);
      expect((r.matched_keywords.length === 0) === (r.matched_rule === "DEFAULT_NO_SIGNAL")).toBe(true);
    }
  });

  it("TRIAGE_PROFILES 字面锁死三值（STRICT/CRITICAL 为 prompt_only 不入 P0 CLI 词表，C5 裁定）", () => {
    expect([...TRIAGE_PROFILES]).toEqual(["MINIMAL", "LIGHT", "STANDARD"]);
  });

  it("TRIAGE_EVIDENCE_GRADES 字面锁死三值（thread-C 五值的 P0-CLI 子集；SELF_REPORTED/NOT_YET_AVAILABLE 未暴露）", () => {
    expect([...TRIAGE_EVIDENCE_GRADES]).toEqual(["MEASURED", "INFERRED", "NOT_CONFIGURED"]);
  });

  it("TRIAGE_ESCALATION_KEYWORDS 字面锁死 7 词（词表序；扩词/改序必须显式过 TODO(vocab-pr) 并更新本测试）", () => {
    expect([...TRIAGE_ESCALATION_KEYWORDS]).toEqual([
      "contract",
      "契约",
      "openapi",
      "api_req",
      "跨域",
      "cross-domain",
      "global",
    ]);
  });

  it("TRIAGE_COPY_STYLE_KEYWORDS 字面锁死 13 词（词表序；同上词汇表 PR 纪律）", () => {
    expect([...TRIAGE_COPY_STYLE_KEYWORDS]).toEqual([
      "文案",
      "样式",
      "配色",
      "字体",
      "颜色",
      "间距",
      "图标",
      "注释",
      "copy",
      "style",
      "css",
      "comment",
      "typo",
    ]);
  });

  it("TRIAGE_ABSENT_SIGNALS 字面锁死 8 信号（P0 唯一可采信号是请求文本，其余一律显式缺席）", () => {
    expect([...TRIAGE_ABSENT_SIGNALS]).toEqual([
      "declared_paths",
      "path_class",
      "contract_surface_registry",
      "dependency_manifest_hit",
      "migration_hit",
      "test_only_hit",
      "diff_stat",
      "governed_object_hits",
    ]);
  });

  it("升档词表与文案词表不相交（若相交，判定顺序将使交集词形永不落 MINIMAL——当前设计无交集）", () => {
    const escalation = new Set<string>(TRIAGE_ESCALATION_KEYWORDS);
    for (const keyword of TRIAGE_COPY_STYLE_KEYWORDS) {
      expect(escalation.has(keyword)).toBe(false);
    }
  });

  it("三词表元素唯一且非空（collectKeywords 去重逻辑的前提不变量）", () => {
    for (const table of [TRIAGE_ESCALATION_KEYWORDS, TRIAGE_COPY_STYLE_KEYWORDS, TRIAGE_ABSENT_SIGNALS]) {
      expect(new Set(table).size).toBe(table.length);
      for (const item of table) {
        expect(item.length).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================================
// CLI triage 命令面（规则桶判定的编排层接线）
// ============================================================

describe("Router 判定矩阵——CLI triage 命令面", () => {
  it("--json 信封 result 与纯函数同构（profile/rule/grade/ttl/absent_signals 逐字段相等）", async () => {
    const request = "contract 流程改造";
    const lines: string[] = [];
    const code = await runCli(["--dir", dir, "triage", request, "--json"], {
      stdout: (line) => lines.push(line),
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<TriageResult>;
    expect(envelope.command).toBe("triage");
    expect(envelope.ok).toBe(true);
    expect(envelope.result).toEqual(triageRequest(request));
  });

  it("human 文案逐段渲染模板（triage → 档位 (rule 规则, grade=证据级, ttl=168h)；人读模式 stdout 两行）", async () => {
    const lines: string[] = [];
    const code = await runCli(["--dir", dir, "triage", "openapi 契约同步"], {
      stdout: (line) => lines.push(line),
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    expect(lines[0]).toBe(
      "triage → STANDARD (rule E_CONTRACT_KEYWORD, grade=INFERRED, ttl=168h)",
    );
    expect(lines[1]).toBe(`  absent signals: ${TRIAGE_ABSENT_SIGNALS.join(", ")}`);
  });

  it("兜底档 human 呈现：LIGHT 请求走同一命令面（triage → LIGHT (rule DEFAULT_NO_SIGNAL…）", async () => {
    const lines: string[] = [];
    const code = await runCli(["--dir", dir, "triage", "新增批量导入功能"], {
      stdout: (line) => lines.push(line),
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    expect(lines[0]).toBe(
      "triage → LIGHT (rule DEFAULT_NO_SIGNAL, grade=NOT_CONFIGURED, ttl=168h)",
    );
  });

  it("缺 <request> 位置参数 → commander 用法错误 exit 1（fail-closed 不裸栈）", async () => {
    const errLines: string[] = [];
    const code = await runCli(["--dir", dir, "triage"], {
      stdout: () => undefined,
      stderr: (line) => errLines.push(line),
    });
    expect(code).toBe(1);
    expect(errLines.join("\n")).toContain("request");
  });
});
