// 规范页 + AI 孪生生成器（Storybook「规范」分区）。
//
// 单一结构化源：packages/cli/seeds/design-standards/antd.yaml（规则，Ant Design 预设）+
// packages/cli/seeds/baseline/frontend/design-tokens.yaml（token 值）。同一次装载、同一个内存模型，产出两样东西：
//   1. 人看的 Storybook 页面：generated/standard/*.stories.ts（不入库，dev/build 前重建）；
//   2. AI 读的孪生：twin/design-standard.json + twin/design-standard.md（入库）。
// 两边盖同一个规范指纹（与 `pomaster design show` 的指纹算法一致）。孪生是否新鲜由
// tests/standard.spec.ts 钉住：规范源改了而孪生没重新生成，CI 失败。
//
// 校验权威在 CLI（pomaster design validate，packages/cli/src/design-standard.ts）；本生成器
// 只做装载与呈现，并由 tests/standard.spec.ts 与 CLI 的归一化结果逐条对账，防两边语义漂移。
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { REPO_ROOT, SEEDS_BASELINE_DIR, STUDIO_ROOT, resetDir, writeFileEnsuringDir } from "./common.mjs";

/** 规范源与 token 合同（工具预设）。 */
export const STANDARD_PATH = join(REPO_ROOT, "packages", "cli", "seeds", "design-standards", "antd.yaml");
export const STANDARD_TOKENS_PATH = join(SEEDS_BASELINE_DIR, "frontend", "design-tokens.yaml");
export const STANDARD_SOURCE_POINTER = "packages/cli/seeds/design-standards/antd.yaml";
export const STANDARD_TOKENS_POINTER = "packages/cli/seeds/baseline/frontend/design-tokens.yaml";
/** 指纹用的逻辑路径（与 CLI design-standard.ts 的 DESIGN_STANDARD_RELATIVE / DESIGN_TOKENS_RELATIVE 一致）。 */
const FINGERPRINT_STANDARD_PATH = "baseline/frontend/design-standard.yaml";
const FINGERPRINT_TOKENS_PATH = "baseline/frontend/design-tokens.yaml";

/** AI 孪生目录（入库）。 */
export const TWIN_DIR = join(STUDIO_ROOT, "twin");
export const TWIN_JSON = "design-standard.json";
export const TWIN_MD = "design-standard.md";
export const TWIN_POINTERS = [`packages/studio/twin/${TWIN_JSON}`, `packages/studio/twin/${TWIN_MD}`];
export const TWIN_SCHEMA = "pomaster.design-standard-twin/v1";
/** 生成器版本：渲染形态变了就加一，孪生随之重生成。 */
export const STANDARD_GENERATOR_VERSION = "1";
/** 在线 Storybook（studio-pages 工作流发布位）。 */
export const STORYBOOK_BASE_URL = "https://river-singer.github.io/POMaster_VNext/";

/** 已接入门禁的检查（与 CLI DESIGN_CHECKS 的 active 一致；对账测试钉住）。 */
export const ACTIVE_CHECKS = new Set([]);

/** 检查编号 → 中文名（展示用；与 CLI DESIGN_CHECKS 对账）。 */
export const CHECK_TITLES = {
  "style.no-raw-color": "不写裸色值",
  "style.spacing-scale": "间距在阶梯内",
  "style.font-size-scale": "字号在字阶内",
  "style.font-weight-allowed": "字重在允许集内",
  "style.font-family-token": "字体族取 token",
  "style.breakpoint-allowed": "断点取规范值",
  "style.no-raw-z-index": "z-index 取层级 token",
  "markup.single-h1": "每个页面视图一个 h1",
  "markup.heading-order": "标题不跳级",
  "markup.heading-level-max": "应用界面标题不超过三级",
  "markup.icon-button-label": "纯图标按钮有可访问名称",
  "grid.span-range": "栅格跨度合法",
  "grid.row-sum": "一行不超过 24 栅格",
  "grid.gutter-allowed": "gutter 取规范值",
  "icon.single-library": "只用一套图标库",
  "markup.single-primary-button": "一个按钮区一个主按钮",
  "text.no-literal-copy": "界面文字走文案字典",
  "text.banned-terms": "不用禁用词",
  "state.store-library": "全局状态库只用 Pinia",
  "state.no-direct-request": "组件不直接发请求",
  "perf.lazy-load": "路由与重组件按需加载",
  "perf.no-full-library-import": "组件库按需引入",
  "format.no-local-pattern": "日期数字走格式化注册表",
};

const DESIGN_SYSTEM_TITLES = { antd: "Ant Design", geist: "Vercel Geist" };
const GROUP_SLUGS = {
  foundations: "foundations",
  "patterns.global": "patterns-global",
  "patterns.principles": "patterns-principles",
  "patterns.templates": "patterns-templates",
  engineering: "engineering",
};
const GROUP_TITLES = {
  foundations: "基础",
  "patterns.global": "设计模式/全局规则",
  "patterns.principles": "设计模式/原则",
  "patterns.templates": "设计模式/模板文档",
  engineering: "工程规范",
};
const SURFACES = ["admin", "public"];
const ICON_NAME = /^[A-Z][A-Za-z0-9]*(Outlined|Filled|TwoTone)$/;
const ICON_TAG = /<([A-Z][A-Za-z0-9]*(?:Outlined|Filled|TwoTone))\b/g;

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** 文本规范化（去 BOM、CRLF → LF），与 CLI normalizeDesignText 一致。 */
export function normalizeText(text) {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/** 规范指纹，与 CLI designStandardFingerprint 一致。 */
export function fingerprintOf(inputs) {
  const lines = inputs.map((input) => `${input.path}\0${sha256Hex(normalizeText(input.text))}`).sort();
  return `sha256:${sha256Hex(lines.join("\n"))}`;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dateText(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value);
}

function lookupToken(tokens, path) {
  let cursor = tokens;
  for (const segment of path.split(".")) {
    if (!isRecord(cursor) || !(segment in cursor)) return undefined;
    cursor = cursor[segment];
  }
  return isRecord(cursor) || Array.isArray(cursor) ? undefined : cursor;
}

/** token 表摊平成点径映射（实时示例里的 `t`；UNKNOWN 不进表，示例引用时直接暴露为 undefined）。 */
function flattenTokens(groups) {
  const out = {};
  const walk = (node, prefix) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      if (isRecord(value)) walk(value, path);
      else if (value !== "UNKNOWN") out[path] = value;
    }
  };
  walk(groups, "");
  return out;
}

function fail(message) {
  throw new Error(`[standard] ${message}（先跑 pomaster design validate 看完整报错）`);
}

function normalizeParam(key, raw, tokens) {
  const base = {
    key,
    label_zh: raw.label_zh ?? null,
    unit: raw.unit ?? "none",
    source: raw.source ?? null,
    note_zh: raw.note_zh ?? null,
  };
  if (raw.token !== undefined) {
    const resolved = lookupToken(tokens, raw.token);
    if (resolved === undefined) fail(`token ${raw.token} 不存在`);
    const pending = resolved === "UNKNOWN";
    return { ...base, kind: "token", token: raw.token, value: pending ? null : resolved, decision_zh: null, candidates: null, pending };
  }
  if (raw.value !== undefined) {
    return { ...base, kind: "value", token: null, value: raw.value, decision_zh: null, candidates: null, pending: false };
  }
  if (raw.decision !== undefined) {
    return { ...base, kind: "decision", token: null, value: null, decision_zh: String(raw.decision).trim(), candidates: raw.candidates ?? null, pending: true };
  }
  return fail(`参数 ${key} 没有取值来源`);
}

function storyExportName(ruleId) {
  return ruleId.replace(/\./g, "_");
}

function storyIdPart(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 装载规范源与 token 表 → 呈现模型（页面与孪生共用）。 */
export function loadStandardModel(standardPath = STANDARD_PATH, tokensPath = STANDARD_TOKENS_PATH) {
  const standardText = readFileSync(standardPath, "utf8");
  const tokensText = existsSync(tokensPath) ? readFileSync(tokensPath, "utf8") : null;
  const raw = yaml.load(standardText);
  if (!isRecord(raw) || raw.schema !== "pomaster.design-standard/v1") fail("规范源 schema 不是 pomaster.design-standard/v1");
  const tokenDoc = tokensText === null ? {} : yaml.load(tokensText);
  const tokenGroups = {};
  for (const [key, value] of Object.entries(isRecord(tokenDoc) ? tokenDoc : {})) {
    if (key !== "meta") tokenGroups[key] = value;
  }

  const sources = {};
  for (const [id, entry] of Object.entries(raw.sources ?? {})) {
    sources[id] = { title_zh: entry.title_zh, url: entry.url, retrieved: dateText(entry.retrieved), note_zh: entry.note_zh ?? null };
  }
  const specs = { ...(raw.specs ?? {}) };
  const meta = {
    design_system: raw.meta.design_system,
    design_system_title_zh: DESIGN_SYSTEM_TITLES[raw.meta.design_system] ?? raw.meta.design_system,
    origin: raw.meta.origin,
    customized: raw.meta.customized,
    ui_library: raw.meta.ui_library,
  };

  const areas = (raw.areas ?? []).map((areaRaw, areaIndex) => {
    const groupSlug = GROUP_SLUGS[areaRaw.group];
    if (groupSlug === undefined) fail(`领域 ${areaRaw.key} 的分区 ${areaRaw.group} 不在词表内`);
    const storybookId = `standard-${groupSlug}-${storyIdPart(areaRaw.key)}`;
    const title = `规范/${GROUP_TITLES[areaRaw.group]}/${areaRaw.title_zh}`;
    const rules = (areaRaw.rules ?? []).map((ruleRaw) => {
      const params = Object.entries(ruleRaw.params ?? {}).map(([key, value]) => normalizeParam(key, value, tokenGroups));
      const enforcement =
        ruleRaw.enforcement.kind === "gate"
          ? {
              kind: "gate",
              check: ruleRaw.enforcement.check,
              check_title_zh: CHECK_TITLES[ruleRaw.enforcement.check] ?? ruleRaw.enforcement.check,
              active: ACTIVE_CHECKS.has(ruleRaw.enforcement.check),
            }
          : { kind: "review" };
      const examples = (ruleRaw.examples ?? []).map((example) => ({
        kind: example.kind,
        title_zh: example.title_zh,
        note_zh: example.note_zh ?? null,
        template: example.template ?? null,
        code: example.code ?? null,
        lang: example.lang ?? null,
      }));
      const anchors = (ruleRaw.anchors ?? []).map((anchor) => ({ spec: anchor.spec, doc: specs[anchor.spec], quote: anchor.quote }));
      return {
        id: ruleRaw.id,
        title_zh: ruleRaw.title_zh,
        statement_zh: ruleRaw.statement_zh,
        rationale_zh: ruleRaw.rationale_zh ?? null,
        surfaces: ruleRaw.surfaces === undefined ? [...SURFACES] : SURFACES.filter((surface) => ruleRaw.surfaces.includes(surface)),
        params,
        anchors,
        enforcement,
        examples,
        storybook: { export: storyExportName(ruleRaw.id), id: `${storybookId}--${storyIdPart(storyExportName(ruleRaw.id))}` },
      };
    });
    return {
      order: areaIndex,
      key: areaRaw.key,
      title_zh: areaRaw.title_zh,
      group: areaRaw.group,
      group_title_zh: GROUP_TITLES[areaRaw.group],
      prefix: areaRaw.prefix,
      summary_zh: areaRaw.summary_zh,
      rules,
      storybook: { title, id: `${storybookId}--overview` },
    };
  });

  const fingerprint = fingerprintOf([
    { path: FINGERPRINT_STANDARD_PATH, text: standardText },
    ...(tokensText === null ? [] : [{ path: FINGERPRINT_TOKENS_PATH, text: tokensText }]),
  ]);
  const ctx = {
    fingerprint,
    meta,
    edit_file: STANDARD_SOURCE_POINTER,
    twin_files: TWIN_POINTERS,
    sources,
    tokens: flattenTokens(tokenGroups),
  };
  return {
    fingerprint,
    meta,
    sources,
    specs,
    areas,
    ctx,
    inputs: [
      { path: STANDARD_SOURCE_POINTER, sha256: sha256Hex(normalizeText(standardText)) },
      ...(tokensText === null ? [] : [{ path: STANDARD_TOKENS_POINTER, sha256: sha256Hex(normalizeText(tokensText)) }]),
    ],
  };
}

/** 一个领域里实时示例用到的图标组件名（模板里的标签 + 参数里的图标名，如动作 → 图标对照表）。 */
export function iconsOfArea(area) {
  const names = new Set();
  const collectValue = (value) => {
    if (typeof value === "string" && ICON_NAME.test(value)) names.add(value);
    else if (Array.isArray(value)) value.forEach(collectValue);
    else if (isRecord(value)) Object.values(value).forEach(collectValue);
  };
  for (const rule of area.rules) {
    const live = rule.examples.filter((example) => example.template !== null);
    for (const example of live) {
      for (const match of example.template.matchAll(ICON_TAG)) names.add(match[1]);
    }
    if (live.length > 0) for (const param of rule.params) collectValue(param.value);
  }
  return [...names].sort();
}

function embed(name, value, type) {
  return `const ${name} = ${JSON.stringify(value, null, 2)} as unknown as ${type};`;
}

function areaFileName(area) {
  return `${String(area.order + 1).padStart(2, "0")}-${area.key}.stories.ts`;
}

function storyName(rule) {
  return `${rule.id} ${rule.title_zh}`;
}

/** 领域 → CSF3 story 文件文本：「概览」整页 + 每条规则一个深链 story。 */
export function renderAreaStory(area, model) {
  const icons = iconsOfArea(area);
  const areaData = { ...area };
  delete areaData.order;
  const lines = [
    `// GENERATED by packages/studio/scripts/lib/standard.mjs —— 禁手改（改 ${STANDARD_SOURCE_POINTER} 后重新生成）。`,
    `// 规范指纹 ${model.fingerprint}`,
    `import type { StoryObj } from '@storybook/vue3';`,
  ];
  if (icons.length > 0) lines.push(`import { ${icons.join(", ")} } from '@ant-design/icons-vue';`);
  lines.push(
    `import { areaPage, rulePage } from '../../src/standard/runtime';`,
    `import type { StdArea, StdContext } from '../../src/standard/runtime';`,
    ``,
    `const ICONS = { ${icons.join(", ")} };`,
    embed("CTX", model.ctx, "StdContext"),
    embed("AREA", areaData, "StdArea"),
    ``,
    `const meta = {`,
    `  title: ${JSON.stringify(area.storybook.title)},`,
    `  id: ${JSON.stringify(area.storybook.id.replace(/--overview$/, ""))},`,
    `  parameters: {`,
    `    layout: 'fullscreen',`,
    `    docs: { description: { component: ${JSON.stringify(`${area.summary_zh}（规范源 ${STANDARD_SOURCE_POINTER}，规范指纹 ${model.fingerprint}）`)} } },`,
    `  },`,
    `};`,
    `export default meta;`,
    ``,
    `export const Overview: StoryObj = {`,
    `  name: '概览',`,
    `  render: () => ({ components: { StdPage: areaPage(AREA, CTX, ICONS) }, template: '<StdPage />' }),`,
    `};`,
  );
  area.rules.forEach((rule, index) => {
    lines.push(
      ``,
      `export const ${rule.storybook.export}: StoryObj = {`,
      `  name: ${JSON.stringify(storyName(rule))},`,
      `  render: () => ({ components: { StdPage: rulePage(AREA.rules[${index}]!, AREA, CTX, ICONS) }, template: '<StdPage />' }),`,
      `};`,
    );
  });
  lines.push("");
  return lines.join("\n");
}

function overviewAreas(model) {
  return model.areas.map((area) => ({
    key: area.key,
    title_zh: area.title_zh,
    group_title_zh: area.group_title_zh,
    summary_zh: area.summary_zh,
    rules: area.rules.length,
    gate: area.rules.filter((rule) => rule.enforcement.kind === "gate").length,
    review: area.rules.filter((rule) => rule.enforcement.kind === "review").length,
    pending: area.rules.reduce((sum, rule) => sum + rule.params.filter((param) => param.pending).length, 0),
    storybook_id: area.storybook.id,
  }));
}

/** 总览 story 文件文本。 */
export function renderOverviewStory(model) {
  return [
    `// GENERATED by packages/studio/scripts/lib/standard.mjs —— 禁手改（改 ${STANDARD_SOURCE_POINTER} 后重新生成）。`,
    `// 规范指纹 ${model.fingerprint}`,
    `import type { StoryObj } from '@storybook/vue3';`,
    `import { overviewPage } from '../../src/standard/runtime';`,
    `import type { StdContext, StdOverviewArea } from '../../src/standard/runtime';`,
    ``,
    embed("CTX", model.ctx, "StdContext"),
    embed("AREAS", overviewAreas(model), "StdOverviewArea[]"),
    ``,
    `const meta = {`,
    `  title: '规范/总览',`,
    `  id: 'standard-overview',`,
    `  parameters: { layout: 'fullscreen' },`,
    `};`,
    `export default meta;`,
    ``,
    `export const Overview: StoryObj = {`,
    `  name: '总览',`,
    `  render: () => ({ components: { StdPage: overviewPage(CTX, AREAS) }, template: '<StdPage />' }),`,
    `};`,
    ``,
  ].join("\n");
}

/** 生成规范 story（返回 { count, files, areas, rules }）。 */
export function generateStandardPages(outDir, model = loadStandardModel()) {
  if (!outDir) throw new Error("generateStandardPages 需要显式 outDir（generate-all 注入）");
  resetDir(outDir);
  const files = [];
  const overview = join(outDir, "00-overview.stories.ts");
  writeFileEnsuringDir(overview, renderOverviewStory(model));
  files.push(overview);
  for (const area of model.areas) {
    const target = join(outDir, areaFileName(area));
    writeFileEnsuringDir(target, renderAreaStory(area, model));
    files.push(target);
  }
  return {
    count: files.length,
    files,
    areas: model.areas.length,
    rules: model.areas.reduce((sum, area) => sum + area.rules.length, 0),
  };
}

// ── AI 孪生 ──────────────────────────────────────────────────────────────────

function storyUrl(id) {
  return `${STORYBOOK_BASE_URL}?path=/story/${id}`;
}

/** 孪生 JSON（确定性输出：无时间戳，键序固定）。 */
export function renderTwinJson(model) {
  const twin = {
    schema: TWIN_SCHEMA,
    note_zh: "Storybook「规范」分区的 AI 可读孪生，与页面同源同指纹。不要手改：改规范源后运行 node packages/studio/run.mjs generate。",
    fingerprint: model.fingerprint,
    generator: { path: "packages/studio/scripts/lib/standard.mjs", version: STANDARD_GENERATOR_VERSION },
    inputs: model.inputs,
    edit: {
      source: STANDARD_SOURCE_POINTER,
      validate: "pomaster design validate",
      regenerate: "node packages/studio/run.mjs generate",
      show: "pomaster design show --json",
    },
    meta: model.meta,
    storybook: { base_url: STORYBOOK_BASE_URL, overview: storyUrl("standard-overview--overview") },
    checks: Object.entries(CHECK_TITLES).map(([id, title_zh]) => ({ id, title_zh, active: ACTIVE_CHECKS.has(id) })),
    areas: model.areas.map((area) => ({
      key: area.key,
      title_zh: area.title_zh,
      group: area.group,
      group_title_zh: area.group_title_zh,
      prefix: area.prefix,
      summary_zh: area.summary_zh,
      storybook: { title: area.storybook.title, id: area.storybook.id, url: storyUrl(area.storybook.id) },
      rules: area.rules.map((rule) => ({
        id: rule.id,
        title_zh: rule.title_zh,
        statement_zh: rule.statement_zh,
        rationale_zh: rule.rationale_zh,
        surfaces: rule.surfaces,
        enforcement: rule.enforcement,
        params: rule.params,
        anchors: rule.anchors,
        examples: rule.examples,
        storybook: { id: rule.storybook.id, url: storyUrl(rule.storybook.id) },
      })),
    })),
    sources: model.sources,
    specs: model.specs,
  };
  return `${JSON.stringify(twin, null, 2)}\n`;
}

const UNIT_SUFFIX = { px: "px", em: "em", percent: "%", ratio: ":1", count: " 个", chars: " 字", ms: "ms", none: "" };

function mdScalar(value, unit) {
  return typeof value === "number" ? `${value}${UNIT_SUFFIX[unit] ?? ""}` : String(value);
}

function mdParam(param, sources) {
  const label = param.label_zh ?? param.key;
  if (param.pending) {
    if (param.kind === "decision") {
      const candidates = param.candidates === null ? "" : `（候选 ${param.candidates.map((c) => mdScalar(c, param.unit)).join(" / ")}）`;
      return `${label} \`p.${param.key}\`：待项目决定——${param.decision_zh}${candidates}`;
    }
    return `${label} \`p.${param.key}\`：待定（token \`${param.token}\` 仍为 UNKNOWN）`;
  }
  let value;
  if (Array.isArray(param.value)) value = param.value.map((item) => mdScalar(item, param.unit)).join(" / ");
  else if (isRecord(param.value)) value = Object.entries(param.value).map(([k, v]) => `${k} → ${v}`).join("，");
  else value = mdScalar(param.value, param.unit);
  const origin = param.kind === "token" ? `token \`${param.token}\`` : (sources[param.source]?.title_zh ?? param.source);
  return `${label} \`p.${param.key}\` = ${value}（${origin}）`;
}

/** 孪生 Markdown 摘要（给 AI 直接读：一条规则一节，条文 + 数值 + 执行方式 + 依据 + 页面地址）。 */
export function renderTwinMarkdown(model) {
  const out = [
    `# 前端设计规范（${model.meta.design_system_title_zh}，${model.meta.ui_library}）`,
    ``,
    `> Storybook「规范」分区的 AI 可读孪生，由 packages/studio/scripts/lib/standard.mjs 生成，与页面同源。不要手改。`,
    `> 规范指纹 \`${model.fingerprint}\`；状态 origin=${model.meta.origin}。`,
    `> 修改规范：编辑 \`${STANDARD_SOURCE_POINTER}\` → \`pomaster design validate\` → \`node packages/studio/run.mjs generate\`。`,
    `> 机器门禁规则违反即拦截（检查未接入时按评审执行）；人工评审规则在评审时逐条核对。`,
    ``,
  ];
  for (const area of model.areas) {
    out.push(`## ${area.group_title_zh} / ${area.title_zh}（${area.prefix}）`, ``, area.summary_zh, ``, `页面：${storyUrl(area.storybook.id)}`, ``);
    for (const rule of area.rules) {
      const enforcement =
        rule.enforcement.kind === "gate"
          ? `机器门禁 \`${rule.enforcement.check}\`${rule.enforcement.active ? "" : "（待接入，暂按评审执行）"}`
          : "人工评审";
      const surfaces = rule.surfaces.length === 2 ? "管理侧与用户侧" : rule.surfaces.map((s) => (s === "admin" ? "管理侧" : "用户侧")).join("、");
      out.push(`### ${rule.id} ${rule.title_zh}`, ``, rule.statement_zh, ``, `- 执行：${enforcement}；适用：${surfaces}`);
      for (const param of rule.params) out.push(`- 参数：${mdParam(param, model.sources)}`);
      for (const anchor of rule.anchors) out.push(`- 硬规范依据：specs/hard/${anchor.doc}「${anchor.quote}」`);
      for (const example of rule.examples) {
        const kind = example.kind === "do" ? "这样做" : "别这样做";
        out.push(`- 示例（${kind}）：${example.title_zh}${example.note_zh === null ? "" : `——${example.note_zh}`}`);
      }
      out.push(`- 页面：${storyUrl(rule.storybook.id)}`, ``);
    }
  }
  out.push(`## 出处`, ``);
  for (const [id, source] of Object.entries(model.sources)) {
    out.push(`- \`${id}\` ${source.title_zh}：${source.url}（核实 ${source.retrieved}）`);
  }
  out.push(``);
  return out.join("\n");
}

/** 写孪生（run.mjs generate 调用）。 */
export function writeStandardTwin(twinDir = TWIN_DIR, model = loadStandardModel()) {
  writeFileEnsuringDir(join(twinDir, TWIN_JSON), renderTwinJson(model));
  writeFileEnsuringDir(join(twinDir, TWIN_MD), renderTwinMarkdown(model));
  return { fingerprint: model.fingerprint, files: [join(twinDir, TWIN_JSON), join(twinDir, TWIN_MD)] };
}
