/**
 * ARCHITECTURE adapter spec（G5 谱系扩展：规则驱动 forbidden import 文本扫描）。
 *
 * 规则形态即语料批 batch-1 已证的「src/** 禁直连 ag-grid 须走 wrapper」。
 * 覆盖：detect 未声明/空规则/齐备三态 / not_configured 诚实缺席全链路 / 违例态→failed
 * + items（仓内相对路径:行号）/ 干净态→passed + notApplicable 显式计数 / import 形态守卫
 * （纯提及不算违例）/ 空目录→warning（零扫描不是 passed）。
 * 真实临时目录 fixture（run 走真实 fs 递归）；全部记录过 ajv 03 schema。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ARCHITECTURE_GATE_CONFIG_FILE,
  createArchitectureAdapter,
  scanFileForRule,
  toGateResultJson,
  type ArchitectureRule,
  type DetectorFacts,
  type GatePolicy,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";
import { fakeFacts, posixJoin } from "./helpers.js";

const adapter = createArchitectureAdapter();

const ROOT = "D:/arch-proj";

const AG_GRID_RULE: ArchitectureRule = {
  name: "fe_no_direct_ag_grid",
  scopePrefix: "src/",
  forbidden: "ag-grid-community",
  suggestion: "须经 components/grid wrapper",
};

function policy(): GatePolicy {
  return { grn: "GRN-91", ranAtSeq: 91, trigger: "on_demand" };
}

function configJson(rules: readonly ArchitectureRule[]): string {
  return JSON.stringify({ rules });
}

function factsWithConfig(files: Record<string, string | null>): DetectorFacts {
  return fakeFacts(ROOT, { files });
}

// ============================================================
// detect：规则四态
// ============================================================

describe("architecture adapter detect", () => {
  it("无 architecture-gate.json → NOT_INSTALLED + 配置落位指引（禁静默）", () => {
    const detection = adapter.detect(factsWithConfig({}));
    expect(detection.status).toBe("NOT_INSTALLED");
    if (detection.status === "NOT_INSTALLED") {
      expect(detection.reason).toMatch(/architecture-gate\.json/);
      expect(detection.installHint).toMatch(/rules/);
    }
  });

  it("rules 空数组 → NOT_INSTALLED（空规则不足以机判；显式缺席非静默）", () => {
    const detection = adapter.detect(
      factsWithConfig({
        [posixJoin(ROOT, ARCHITECTURE_GATE_CONFIG_FILE)]: configJson([]),
      }),
    );
    expect(detection.status).toBe("NOT_INSTALLED");
    if (detection.status === "NOT_INSTALLED") {
      expect(detection.reason).toMatch(/为空/);
    }
  });

  it("规则齐备 → READY，evidence 含规则数", () => {
    const detection = adapter.detect(
      factsWithConfig({
        [posixJoin(ROOT, ARCHITECTURE_GATE_CONFIG_FILE)]: configJson([AG_GRID_RULE]),
      }),
    );
    expect(detection.status).toBe("READY");
    if (detection.status === "READY") {
      expect(detection.evidence).toContain("1");
    }
  });
});

// ============================================================
// 真实临时目录 fixture（run 走真实 fs 递归扫描）
// ============================================================

const tempRoots: string[] = [];

afterEach(() => {
  // 临时目录留给 OS tmp 清理（Windows EBUSY 规避，同 integration spec 惯例）。
  tempRoots.length = 0;
});

function makeTempProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "pomaster-gauntlet-arch-"));
  tempRoots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const full = join(root, relative);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return root;
}

/** 全链路：prepare（真实 fs facts）→ run → normalize。 */
function fullPipeline(projectRoot: string, rules: readonly ArchitectureRule[] | null) {
  const facts =
    rules === null
      ? fakeFacts(projectRoot, { files: {} })
      : fakeFacts(projectRoot, {
          files: {
            [posixJoin(projectRoot, ARCHITECTURE_GATE_CONFIG_FILE)]: configJson(rules),
          },
        });
  const plan = adapter.prepare({ projectRoot }, policy(), facts);
  const raw = adapter.run(plan);
  return adapter.normalize(raw, {});
}

const ajv = new Ajv({ strictSchema: false });
addFormats(ajv);
const validate = ajv.compile(gateResultSchema as unknown as Parameters<typeof ajv.compile>[0]);

// ============================================================
// not_configured：规则未声明 = 诚实缺席
// ============================================================

describe("architecture adapter：not_configured 诚实缺席", () => {
  it("未声明全链路 → verdict=not_configured（≠passed）+ scope.note 指引 + counts 显式全零", () => {
    const root = makeTempProject({ "src/a.ts": "export const a = 1;\n" });
    const record = fullPipeline(root, null);
    expect(record.verdict).toBe("not_configured");
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    expect(record.scopeNote).toMatch(/architecture-gate\.json/);
    const doc = toGateResultJson(record);
    if (!validate(doc)) {
      console.error(validate.errors);
    }
    expect(validate(doc)).toBe(true);
  });
});

// ============================================================
// 违例态 / 干净态（语料批 batch-1 规则形态）
// ============================================================

describe("architecture adapter：违例态与干净态", () => {
  it("src/** 直连 ag-grid → failed violations 计行数 + items location 仓内相对路径:行号", () => {
    const root = makeTempProject({
      "src/grid/direct.ts": 'import { Grid } from "ag-grid-community";\nexport { Grid };\n',
      "src/other.ts": "export const ok = 1;\n",
    });
    const record = fullPipeline(root, [AG_GRID_RULE]);
    expect(record.verdict).toBe("failed");
    expect(record.counts).toEqual({
      scanned: 2,
      applicableScanned: 2,
      violations: 1,
      notApplicable: 0,
    });
    expect(record.items).toEqual([
      {
        rule: "fe_no_direct_ag_grid",
        location: "src/grid/direct.ts:1",
        message: expect.stringContaining("wrapper"),
      },
    ]);
    const doc = toGateResultJson(record);
    if (!validate(doc)) {
      console.error(validate.errors);
    }
    expect(validate(doc)).toBe(true);
  });

  it("干净态（走 wrapper）→ passed；规则覆盖外文件（scripts/）计入 notApplicable（数字不是沉默）", () => {
    const root = makeTempProject({
      "src/grid/wrapper.ts": 'import { Grid } from "./grid-impl";\nexport { Grid };\n',
      "src/app.ts": 'import { Grid } from "./grid/wrapper";\n',
      "scripts/build.cjs": 'const x = require("fs");\n',
    });
    const record = fullPipeline(root, [AG_GRID_RULE]);
    expect(record.verdict).toBe("passed");
    expect(record.counts.scanned).toBe(3);
    expect(record.counts.applicableScanned).toBe(2);
    expect(record.counts.violations).toBe(0);
    expect(record.counts.notApplicable).toBe(1);
    expect(record.blindspot).toEqual({
      scanned: 3,
      produced: 2,
      escapeRatio: Math.max(0, (3 - 2) / 3),
    });
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("forbidden 出现在非 import 行（纯提及/文档串）→ 不计违例（import 形态守卫）", () => {
    const root = makeTempProject({
      "src/docs.ts":
        "// ag-grid-community 是网格底座，升级看 CHANGELOG\nconst note = 'ag-grid-community';\nexport { note };\n",
    });
    const record = fullPipeline(root, [AG_GRID_RULE]);
    expect(record.verdict).toBe("passed");
    expect(record.counts.violations).toBe(0);
  });

  it("规则覆盖外目录（scopePrefix 不匹配）→ notApplicable 显式计数 + blindspot escapeRatio 如实呈现", () => {
    const root = makeTempProject({
      "src/inside.ts": "export const a = 1;\n",
      "packages/outside.ts": 'import { Grid } from "ag-grid-community";\n',
    });
    const record = fullPipeline(root, [AG_GRID_RULE]);
    expect(record.counts.scanned).toBe(2);
    expect(record.counts.applicableScanned).toBe(1);
    expect(record.counts.notApplicable).toBe(1);
    expect(record.blindspot.escapeRatio).toBeCloseTo(0.5, 12);
  });

  it("空目录（规则配置了但零文件）→ warning + zero_applicable_files_nothing_verified", () => {
    const root = makeTempProject({});
    const record = fullPipeline(root, [AG_GRID_RULE]);
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe("zero_applicable_files_nothing_verified");
  });
});

// ============================================================
// 扫描器纯函数：形态守卫与多行计数
// ============================================================

describe("scanFileForRule 纯函数", () => {
  it("require 形态命中；多行违例逐行计数；每行每规则至多一条", () => {
    const rule: ArchitectureRule = { name: "r", scopePrefix: "src/", forbidden: "ag-grid-community" };
    const text = [
      'const g = require("ag-grid-community");',
      "export const a = 1;",
      'import { x } from "ag-grid-community";',
    ].join("\n");
    const violations = scanFileForRule(text, rule, "src/a.ts");
    expect(violations.map((v) => v.location)).toEqual(["src/a.ts:1", "src/a.ts:3"]);
  });
});
