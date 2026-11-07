/**
 * design-check.spec.ts —— 设计规范门禁（`pomaster design check`；check --gates 的 GATE.DESIGN.STANDARD；closeout）。
 *
 * 判据：
 * - 只跑规范里 enforcement=gate 的条文，阈值取条文参数（antd：间距 4/8/12/16/24/32、24 列、gutter 16/24……；
 *   geist：间距 4 的倍数、圆角 6/12/16、字重 400–600、列间距 16/24……），参数仍是决策位的检查记待定；
 * - Vue SFC 三段、TSX、样式文件、Tailwind 类都能读；注释里的写法不算；
 * - 带理由的豁免生效，没理由的不生效并警告；
 * - 存量基线只拦新增；
 * - 三消费面同一判卷：design check、closeout 聚合、check --gates（项目没落地规范 → not_configured）；
 * - DESIGN_CHECKS.active 与实现表一致。
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DESIGN_CHECKS,
  IMPLEMENTED_DESIGN_CHECKS,
  assessDesignStandard,
  designStandardGateErrors,
  designStandardToRecord,
  runDesignCheck,
  type DesignCheckReport,
} from "@pomaster/cli";

const SEEDS = fileURLToPath(new URL("../seeds/", import.meta.url));

let dir: string;

function write(path: string, text: string): void {
  const target = join(dir, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text, "utf8");
}

function report(input: Parameters<typeof assessDesignStandard>[1] = {}): DesignCheckReport {
  const result = assessDesignStandard(dir, input);
  if (!("checks" in result)) throw new Error(`${result.code}: ${result.message}`);
  return result;
}

function failedChecks(result: DesignCheckReport): string[] {
  return result.checks.filter((check) => check.status === "failed").map((check) => check.id);
}

function adoptPreset(system: "antd" | "geist"): void {
  const base = join(dir, ".pomaster", "baseline", "frontend");
  mkdirSync(base, { recursive: true });
  copyFileSync(join(SEEDS, "design-standards", `${system}.yaml`), join(base, "design-standard.yaml"));
  copyFileSync(join(SEEDS, "baseline", "frontend", "design-tokens.yaml"), join(base, "design-tokens.yaml"));
}

const BAD_VUE = `<template>
  <div class="page">
    <h1>车型列表</h1>
    <h1>{{ t('vehicle.title') }}</h1>
    <h2>{{ t('a') }}</h2>
    <h4>{{ t('b') }}</h4>
    <div v-html="html"></div>
    <a href="https://example.com" target="_blank">{{ t('link') }}</a>
    <a-row :gutter="20">
      <a-col :span="25">{{ t('x') }}</a-col>
    </a-row>
    <a-button :icon="h(ReloadOutlined)" />
    <a-tag color="#f50">{{ t('tag') }}</a-tag>
    <p>其它说明</p>
  </div>
</template>

<script setup lang="ts">
import Antd from 'ant-design-vue';
import { createStore } from 'vuex';
import { Home } from 'lucide-vue-next';
import axios from 'axios';
const when = dayjs().format('YYYY-MM-DD');
eval('1 + 1');
localStorage.setItem('access_token', token);
try {
  load();
} catch (error) {
  console.error(error);
}
fetch('/api/vehicles');
</script>

<style scoped>
.page { color: #333; margin: 10px; font-size: 13px; border-radius: 5px; box-shadow: 0 1px 2px rgba(0,0,0,.2); z-index: 999; transition: width .2s; font-weight: 700; font-family: 'Comic Sans MS'; }
@keyframes grow { from { width: 0; } to { width: 100px; } }
@media (min-width: 900px) { .page { margin: 16px; } }
</style>
`;

const GOOD_VUE = `<template>
  <div class="page">
    <h1>{{ t('vehicle.title') }}</h1>
    <h2>{{ t('vehicle.section') }}</h2>
    <a :href="url" target="_blank" rel="noopener noreferrer">{{ t('link') }}</a>
    <a-row :gutter="16"><a-col :span="12" :md="{ span: 8, offset: 4 }">{{ t('x') }}</a-col></a-row>
    <a-button :icon="h(ReloadOutlined)" :aria-label="t('vehicle.refresh')" />
    <!-- 注释里的写法不算：<div v-html="x"></div> color: #fff -->
  </div>
</template>

<script setup lang="ts">
import { ReloadOutlined } from '@ant-design/icons-vue';
import { defineStore } from 'pinia';
// 注释：localStorage.setItem('token', x); eval('x'); color: '#fff'
const label = formatDate(value);
</script>

<style scoped>
.page { color: var(--color-text); margin: 16px 24px; padding: 0 8px; font-size: 14px; border-radius: 6px; box-shadow: var(--elevation-card); z-index: 1; transition: transform .2s, opacity .2s; font-weight: 500; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .page { animation: none; } }
@media (min-width: 768px) { .page { margin: 24px; } }
</style>
`;

const BAD_ROUTER = `import { createRouter } from 'vue-router';
import UserList from '@/views/user/UserList.vue';
export const routes = [
  { path: '/users', component: UserList },
  { path: '/orders', component: () => import('@/views/order/OrderList.vue'), meta: { auth: true, permission: 'order:read' } },
  { path: '/', redirect: '/users' },
];
`;

const BAD_TSX = `import { Copy } from 'lucide-react';
import { create } from 'zustand';
import { configureStore } from '@reduxjs/toolkit';

export function Deployments({ html }: { html: string }) {
  return (
    <section className="p-[13px] rounded-[10px] bg-[#ffffff] text-red-500 transition-all z-[999] font-bold rounded-lg">
      <div className="grid grid-cols-12 gap-5 p-4 rounded-md font-semibold" />
      <Button size="icon"><Copy /></Button>
      <Button size="icon" aria-label="复制部署地址"><Copy /></Button>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <p style={{ marginTop: 10, color: '#111' }}>{label}</p>
    </section>
  );
}
`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "design-check-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("检查词表与实现对账", () => {
  it("DESIGN_CHECKS.active 恰好等于已实现的检查", () => {
    const active = DESIGN_CHECKS.filter((check) => check.active).map((check) => check.id).sort();
    expect(active).toEqual([...IMPLEMENTED_DESIGN_CHECKS]);
    expect(DESIGN_CHECKS.filter((check) => !check.active).map((check) => check.id).sort()).toEqual(["grid.row-sum", "markup.single-primary-button"]);
  });
});

describe("antd 规范扫 Vue 工程", () => {
  it("违规按条文找出来，阈值取条文参数", () => {
    write("frontend/src/views/vehicle/VehicleList.vue", BAD_VUE);
    write("frontend/src/router/index.ts", BAD_ROUTER);
    const result = report();
    expect(result.applicable).toBe(true);
    expect(result.design_system).toBe("antd");
    expect(result.roots).toEqual(["frontend/src"]);
    expect(result.files).toBe(2);
    const failed = failedChecks(result);
    for (const id of [
      "style.no-raw-color",
      "style.spacing-scale",
      "style.font-size-scale",
      "style.font-weight-allowed",
      "style.font-family-token",
      "style.radius-token",
      "style.shadow-token",
      "style.no-raw-z-index",
      "style.breakpoint-allowed",
      "motion.transform-only",
      "motion.reduced-motion",
      "markup.single-h1",
      "markup.heading-order",
      "markup.heading-level-max",
      "markup.icon-button-label",
      "grid.span-range",
      "grid.gutter-allowed",
      "icon.single-library",
      "text.banned-terms",
      "text.no-literal-copy",
      "format.no-local-pattern",
      "state.store-library",
      "state.no-direct-request",
      "perf.lazy-load",
      "perf.no-full-library-import",
      "security.no-unsafe-html",
      "security.safe-link",
      "security.no-eval",
      "security.no-token-storage",
      "error.no-empty-catch",
      "guard.route-meta",
    ]) {
      expect(failed, id).toContain(id);
    }
    const spacing = result.findings.find((finding) => finding.check === "style.spacing-scale");
    expect(spacing?.message).toContain("4 / 8 / 12 / 16 / 24 / 32");
    expect(spacing?.file).toBe("frontend/src/views/vehicle/VehicleList.vue");
    expect(spacing?.line).toBe(BAD_VUE.split("\n").findIndex((line) => line.startsWith(".page {")) + 1);
    expect(result.findings.find((finding) => finding.check === "grid.gutter-allowed")?.message).toContain("16 / 24");
    expect(result.findings.find((finding) => finding.check === "text.banned-terms")?.message).toBe("「其它」应写作「其他」");
    const route = result.findings.filter((finding) => finding.check === "guard.route-meta");
    expect(route).toHaveLength(1);
    expect(route[0]?.line).toBe(4);
  });

  it("合规写法零违规；注释里的写法不算", () => {
    write("frontend/src/views/vehicle/VehicleList.vue", GOOD_VUE);
    const result = report();
    expect(result.findings).toEqual([]);
    expect(result.violations).toBe(0);
    expect(failedChecks(result)).toEqual([]);
    // 参数仍是决策位的检查记待定（antd 的层级档位不影响 z-index 检查本身；没有待定也成立）
    expect(result.checks.every((check) => check.status !== "failed")).toBe(true);
  });

  it("豁免：带理由的生效并计数，没理由的不生效并警告", () => {
    write(
      "frontend/src/views/a.vue",
      `<style>
/* pomaster-design-ignore style.no-raw-color: 第三方地图 SDK 要求的品牌色 */
.map { color: #1a73e8; }
/* pomaster-design-ignore style.spacing-scale */
.gap { margin: 10px; }
</style>
`,
    );
    const result = report({ only: ["style.no-raw-color", "style.spacing-scale"] });
    expect(result.suppressed).toBe(1);
    expect(failedChecks(result)).toEqual(["style.spacing-scale"]);
    expect(result.warnings.map((warning) => warning.code)).toContain("DESIGN_SUPPRESSION_REASON_MISSING");
  });

  it("存量基线：写下后只拦新增，减少了提示收紧", () => {
    write("frontend/src/views/a.vue", `<style>\n.a { margin: 10px; }\n.b { margin: 14px; }\n</style>\n`);
    const written = report({ writeBaseline: true });
    expect(written.violations).toBe(0);
    expect(written.baselined).toBe(2);
    const baseline = JSON.parse(readFileSync(join(dir, ".pomaster/baseline/frontend/design-check-baseline.json"), "utf8")) as { schema: string; counts: Record<string, number> };
    expect(baseline).toEqual({ schema: "pomaster.design-check-baseline/v1", counts: { "style.spacing-scale frontend/src/views/a.vue": 2 } });

    expect(report().violations).toBe(0);
    write("frontend/src/views/a.vue", `<style>\n.a { margin: 10px; }\n.b { margin: 14px; }\n.c { padding: 6px; }\n</style>\n`);
    const grown = report();
    expect(grown.violations).toBe(1);
    expect(grown.baselined).toBe(2);
    write("frontend/src/views/b.vue", `<style>\n.d { gap: 5px; }\n</style>\n`);
    expect(report().violations).toBe(2);
    expect(report({ ignoreBaseline: true }).violations).toBe(4);

    rmSync(join(dir, "frontend/src/views/b.vue"));
    write("frontend/src/views/a.vue", `<style>\n.a { margin: 10px; }\n</style>\n`);
    const shrunk = report();
    expect(shrunk.violations).toBe(0);
    expect(shrunk.warnings.map((warning) => warning.code)).toContain("DESIGN_BASELINE_TIGHTENABLE");
  });

  it("命令面：违规退出非 0 并带 DESIGN_CHECK_VIOLATIONS；--root 指定目录", () => {
    write("web/app/pages/a.vue", `<style>\n.a { margin: 10px; }\n</style>\n`);
    const missing = runDesignCheck(dir);
    expect(missing.ok).toBe(true);
    expect(missing.result?.applicable).toBe(false);
    const outcome = runDesignCheck(dir, { roots: ["web/app"] });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("DESIGN_CHECK_VIOLATIONS");
    expect(outcome.human.join("\n")).toContain("web/app/pages/a.vue:2");
  });
});

describe("geist 规范扫 React + Tailwind 工程", () => {
  it("任意值、默认色板、圆角档、字重、图标按钮、危险渲染、状态库", () => {
    write("src/app/deployments/page.tsx", BAD_TSX);
    const result = report({ system: "geist" });
    expect(result.design_system).toBe("geist");
    expect(result.roots).toEqual(["src"]);
    const failed = failedChecks(result);
    for (const id of [
      "style.spacing-scale",
      "style.radius-token",
      "style.no-raw-color",
      "motion.transform-only",
      "style.no-raw-z-index",
      "style.font-weight-allowed",
      "markup.icon-button-label",
      "security.no-unsafe-html",
      "state.store-library",
    ]) {
      expect(failed, id).toContain(id);
    }
    const messages = result.findings.map((finding) => `${finding.check} ${finding.message}`);
    expect(messages.some((m) => m.startsWith("style.radius-token rounded-lg（8px）"))).toBe(true);
    expect(messages.some((m) => m.includes("rounded-md"))).toBe(false);
    expect(messages.some((m) => m.startsWith("style.font-weight-allowed font-bold（700）"))).toBe(true);
    expect(messages.some((m) => m.includes("font-semibold"))).toBe(false);
    expect(messages.some((m) => m.startsWith("style.spacing-scale p-[13px]"))).toBe(true);
    expect(messages.some((m) => m.startsWith("style.spacing-scale margin-top 10px"))).toBe(true);
    expect(messages.some((m) => m.includes("p-4"))).toBe(false);
    expect(result.findings.filter((finding) => finding.check === "markup.icon-button-label")).toHaveLength(1);
    expect(result.findings.filter((finding) => finding.check === "state.store-library").map((finding) => finding.message)).toEqual([
      "引入了全局状态库 @reduxjs/toolkit，规范只用 zustand",
    ]);
    // Geist 的列间距取预设数值默认 16 / 24：gap-5（20px）违规
    const gutter = result.checks.find((check) => check.id === "grid.gutter-allowed");
    expect(gutter?.status).toBe("failed");
    expect(result.findings.find((finding) => finding.check === "grid.gutter-allowed")?.message).toContain("gap-5（20px）");
  });

  it("组件库层（components/ui）与测试、故事文件不扫", () => {
    write("src/components/ui/button.tsx", `export const b = <div className="rounded-[3px] bg-[#000]" />;\n`);
    write("src/features/a.stories.tsx", `export const s = <div className="bg-[#000]" />;\n`);
    write("src/features/a.spec.ts", `const c = { color: '#000' };\n`);
    const result = report({ system: "geist" });
    expect(result.files).toBe(0);
    expect(result.violations).toBe(0);
  });
});

describe("三消费面同一判卷", () => {
  it("项目没落地规范：门不适用（closeout 不阻断，GRN 记 not_configured）", () => {
    write("frontend/src/views/a.vue", BAD_VUE);
    expect(designStandardGateErrors(dir)).toEqual([]);
    const gate = assessDesignStandard(dir, { requireProjectStandard: true });
    const record = designStandardToRecord(gate, { grn: "GRN-0001", ranAtSeq: 1 });
    expect(record.verdict).toBe("not_configured");
    expect(record.gateDef).toBe("GATE.DESIGN.STANDARD@0.1.0");
  });

  it("项目落地了规范：违规阻断 closeout，GRN 记 failed（违规检查数）", () => {
    adoptPreset("antd");
    write("frontend/src/views/a.vue", `<style>\n.a { margin: 10px; color: #333; }\n</style>\n`);
    const errors = designStandardGateErrors(dir);
    expect(errors.map((error) => error.code)).toEqual(["DESIGN_CHECK_VIOLATIONS"]);
    const gate = assessDesignStandard(dir, { requireProjectStandard: true });
    if (!("checks" in gate)) throw new Error(gate.code);
    expect(gate.mode).toBe("project");
    const record = designStandardToRecord(gate, { grn: "GRN-0002", ranAtSeq: 2 });
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(2);
    expect(record.counts.scanned).toBe(gate.checks.length);
    expect(record.counts.notApplicable).toBe(gate.checks.filter((check) => check.status === "pending").length);

    write("frontend/src/views/a.vue", `<style>\n.a { margin: 16px; color: var(--color-text); }\n</style>\n`);
    expect(designStandardGateErrors(dir)).toEqual([]);
    expect(designStandardToRecord(assessDesignStandard(dir, { requireProjectStandard: true }), { grn: "GRN-0003", ranAtSeq: 3 }).verdict).toBe("passed");
  });

  it("规范坏了：判卷器 fail-closed（blocked / DESIGN_STANDARD_INVALID）", () => {
    adoptPreset("antd");
    writeFileSync(join(dir, ".pomaster/baseline/frontend/design-standard.yaml"), "schema: pomaster.design-standard/v1\nareas: 3\n", "utf8");
    write("frontend/src/views/a.vue", GOOD_VUE);
    expect(designStandardGateErrors(dir).map((error) => error.code)).toEqual(["DESIGN_STANDARD_INVALID"]);
    expect(designStandardToRecord(assessDesignStandard(dir, { requireProjectStandard: true }), { grn: "GRN-0004", ranAtSeq: 4 }).verdict).toBe("blocked");
  });
});
