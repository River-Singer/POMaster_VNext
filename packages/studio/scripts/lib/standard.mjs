// 规范页 + AI 孪生生成器（Storybook「规范」分区）。
//
// 单一结构化源：规范源（Vue 画廊用 packages/cli/seeds/design-standards/antd.yaml，React 画廊用 geist.yaml）+
// 统一骨架（design-standards/skeleton.yaml，两套体系目录的并集）+ token 合同（design-tokens.yaml）。
// 同一次装载、同一个内存模型，产出两样东西：
//   1. 人看的 Storybook 页面：generated/standard/*.stories.ts（不入库，dev/build 前重建）；页面结构由
//      src/standard/page.ts 构建（两个画廊共用），本文件只把数据嵌进 story 文件；
//   2. AI 读的孪生：twin/design-standard.json + twin/design-standard.md（入库）。
// 两边盖同一个规范指纹（与 `pomaster design show` 的指纹算法一致）。孪生是否新鲜由
// tests/standard.spec.ts 钉住：规范源或骨架改了而孪生没重新生成，CI 失败。
//
// 骨架里有、本体系还没写的领域与条目照样进模型（covered=false），页面显示「待补」——两个抽屉的目录
// 因此完全相同。校验权威在 CLI（pomaster design validate，packages/cli/src/design-standard.ts）；本生成器
// 只做装载与呈现，并由 tests/standard.spec.ts 与 CLI 的归一化结果逐条对账，防两边语义漂移。
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { REPO_ROOT, SEEDS_BASELINE_DIR, STUDIO_ROOT, resetDir, writeFileEnsuringDir } from "./common.mjs";

/** 规范源、骨架与 token 合同（工具预设）。 */
export const STANDARD_PATH = join(REPO_ROOT, "packages", "cli", "seeds", "design-standards", "antd.yaml");
export const SKELETON_PATH = join(REPO_ROOT, "packages", "cli", "seeds", "design-standards", "skeleton.yaml");
export const STANDARD_TOKENS_PATH = join(SEEDS_BASELINE_DIR, "frontend", "design-tokens.yaml");
export const STANDARD_SOURCE_POINTER = "packages/cli/seeds/design-standards/antd.yaml";
export const SKELETON_POINTER = "packages/cli/seeds/design-standards/skeleton.yaml";
export const STANDARD_TOKENS_POINTER = "packages/cli/seeds/baseline/frontend/design-tokens.yaml";
/** 指纹用的逻辑路径（与 CLI design-standard.ts 的 DESIGN_STANDARD_RELATIVE / DESIGN_TOKENS_RELATIVE / DESIGN_SKELETON_RELATIVE 一致）。 */
const FINGERPRINT_STANDARD_PATH = "baseline/frontend/design-standard.yaml";
const FINGERPRINT_TOKENS_PATH = "baseline/frontend/design-tokens.yaml";
const FINGERPRINT_SKELETON_PATH = "design-standards/skeleton.yaml";

/** AI 孪生目录（入库）。 */
export const TWIN_DIR = join(STUDIO_ROOT, "twin");
export const TWIN_JSON = "design-standard.json";
export const TWIN_MD = "design-standard.md";
export const TWIN_POINTERS = [`packages/studio/twin/${TWIN_JSON}`, `packages/studio/twin/${TWIN_MD}`];
export const TWIN_SCHEMA = "pomaster.design-standard-twin/v2";
/** 生成器版本：渲染形态变了就加一，孪生随之重生成。 */
export const STANDARD_GENERATOR_VERSION = "2";
/** 在线 Storybook（studio-pages 工作流发布位：总 Storybook 在根路径，两个抽屉各在子路径）。 */
export const STORYBOOK_SITE_URL = "https://river-singer.github.io/POMaster_VNext/";
export const STORYBOOK_BASE_URL = `${STORYBOOK_SITE_URL}vue/`;

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
  "grid.row-sum": "一行不超过栅格总列数",
  "grid.gutter-allowed": "gutter 取规范值",
  "icon.single-library": "只用一套图标库",
  "markup.single-primary-button": "一个按钮区一个主按钮",
  "text.no-literal-copy": "界面文字走文案字典",
  "text.banned-terms": "不用禁用词",
  "state.store-library": "全局状态库只用规定的一个",
  "state.no-direct-request": "组件不直接发请求",
  "perf.lazy-load": "路由与重组件按需加载",
  "perf.no-full-library-import": "组件库按需引入",
  "format.no-local-pattern": "日期数字走格式化注册表",
  "style.radius-token": "圆角取规范档位",
  "style.shadow-token": "阴影取规范层级",
  "motion.transform-only": "过渡只动 transform 与透明度",
  "motion.reduced-motion": "关键帧动画有减少动效分支",
  "security.no-unsafe-html": "不进危险渲染",
  "security.safe-link": "外链与跳转安全",
  "security.no-eval": "不用动态执行",
  "security.no-token-storage": "凭据不进浏览器存储",
  "error.no-empty-catch": "不吞错误",
  "guard.route-meta": "路由声明访问要求",
};

/** 实验编号（与 CLI DESIGN_LABS 对账；src/standard/labs.ts 逐个实现）。 */
export const LAB_IDS = [
  "state.url-filters",
  "state.query-cache",
  "state.race",
  "context.restore",
  "loading.delay",
  "error.boundary",
  "guard.route",
  "async.retry",
  "concurrency.pool",
  "click.guard",
  "prototype.convert",
];

const DESIGN_SYSTEM_TITLES = { antd: "Ant Design", geist: "Vercel Geist" };
/** 分区 → 中文标题（与 CLI DESIGN_AREA_GROUPS 对账）。Storybook 侧栏路径即「规范/<标题>/<领域>」。 */
export const GROUP_TITLES = {
  foundations: "基础",
  "components.general": "组件/通用",
  "components.layout": "组件/布局",
  "components.navigation": "组件/导航",
  "components.entry": "组件/数据录入",
  "components.display": "组件/数据展示",
  "components.feedback": "组件/反馈",
  "components.other": "组件/其他",
  "patterns.global": "设计模式/全局规则",
  "patterns.principles": "设计模式/原则",
  "patterns.templates": "设计模式/模板文档",
  "patterns.experience": "设计模式/体验管理",
  "patterns.data": "设计模式/数据呈现",
  engineering: "工程规范",
};
const SURFACES = ["admin", "public"];
const ICON_NAME = /^[A-Z][A-Za-z0-9]*(Outlined|Filled|TwoTone)$/;
const ICON_TAG = /<([A-Z][A-Za-z0-9]*(?:Outlined|Filled|TwoTone))\b/g;
const LIVE_TOKEN_REFERENCE = /\bt\[\s*['"]/;

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

/** 原始结构里有没有 token 引用（与 CLI design.ts 的 mentionsTokens 同口径）。 */
function mentionsTokens(node) {
  if (Array.isArray(node)) return node.some(mentionsTokens);
  if (!isRecord(node)) return false;
  return Object.entries(node).some(([key, value]) => {
    if ((key === "template" || key === "jsx") && typeof value === "string") return LIVE_TOKEN_REFERENCE.test(value);
    if (key === "token" && typeof value === "string") return true;
    return typeof value === "object" && value !== null && mentionsTokens(value);
  });
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

function normalizeSwatch(raw, tokens) {
  const usage_zh = raw.usage_zh ?? null;
  if (raw.value !== undefined) return { name: raw.name, kind: "value", token: null, value: String(raw.value).trim(), pending_zh: null, usage_zh };
  if (raw.token !== undefined) {
    const resolved = lookupToken(tokens, raw.token);
    if (resolved === undefined) fail(`色块 ${raw.name} 的 token ${raw.token} 不存在`);
    const value = resolved === "UNKNOWN" ? null : String(resolved);
    return { name: raw.name, kind: "token", token: raw.token, value, pending_zh: value === null ? `token ${raw.token} 仍为 UNKNOWN` : null, usage_zh };
  }
  return { name: raw.name, kind: "pending", token: null, value: null, pending_zh: raw.pending_zh ?? null, usage_zh };
}

function normalizeShowcase(raw, tokens) {
  if (raw.kind === "demo") {
    return { kind: "demo", title_zh: raw.title_zh, description_zh: raw.description_zh ?? null, template: raw.template ?? null, jsx: raw.jsx ?? null };
  }
  if (raw.kind === "specimen") {
    return {
      kind: "specimen",
      title_zh: raw.title_zh ?? null,
      description_zh: raw.description_zh ?? null,
      name_label_zh: raw.name_label_zh ?? null,
      rows: (raw.rows ?? []).map((row) => ({
        name: String(row.name),
        usage_zh: row.usage_zh ?? null,
        sample_zh: row.sample_zh ?? null,
        template: row.template ?? null,
        jsx: row.jsx ?? null,
      })),
    };
  }
  if (raw.kind === "palette") {
    return {
      kind: "palette",
      title_zh: raw.title_zh ?? null,
      description_zh: raw.description_zh ?? null,
      source: raw.source ?? null,
      scales: (raw.scales ?? []).map((scale) => ({
        name: scale.name,
        label_zh: scale.label_zh ?? null,
        swatches: (scale.swatches ?? []).map((swatch) => normalizeSwatch(swatch, tokens)),
      })),
    };
  }
  if (raw.kind === "lab") return { kind: "lab", lab: raw.lab, title_zh: raw.title_zh, description_zh: raw.description_zh ?? null };
  return fail(`未知的演示块 ${raw.kind}`);
}

function normalizePlayground(raw) {
  if (raw === undefined || raw === null) return null;
  const props = Object.entries(raw.props ?? {}).map(([key, value]) =>
    value.options !== undefined
      ? { key, kind: "options", options: value.options.map((item) => String(item)), default: String(value.default) }
      : { key, kind: "boolean", default: value.default === true },
  );
  return {
    component: raw.component,
    text_zh: raw.text_zh ?? null,
    props,
    matrix: raw.matrix === undefined ? null : { rows: raw.matrix.rows, columns: raw.matrix.columns },
  };
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

/** 呈现档案：同一套生成逻辑服务 Vue 画廊（Ant Design 预设，缺省）与 React 画廊（Geist 预设）。 */
export const ANTD_PROFILE = {
  source_pointer: STANDARD_SOURCE_POINTER,
  tokens_pointer: STANDARD_TOKENS_POINTER,
  skeleton_pointer: SKELETON_POINTER,
  twin_pointers: TWIN_POINTERS,
  storybook_base_url: STORYBOOK_BASE_URL,
  generator_path: "packages/studio/scripts/lib/standard.mjs",
  code_lang: "Vue 模板",
  validate_cmd: "pomaster design validate",
  regenerate_cmd: "node packages/studio/run.mjs generate",
  show_cmd: "pomaster design show --json",
};

function readSkeleton(skeletonPath) {
  const text = readFileSync(skeletonPath, "utf8");
  const raw = yaml.load(text);
  if (!isRecord(raw) || raw.schema !== "pomaster.design-skeleton/v1" || !Array.isArray(raw.areas)) fail("骨架 schema 不是 pomaster.design-skeleton/v1");
  return { text, areas: raw.areas };
}

/** 装载规范源、骨架与 token 表 → 呈现模型（页面与孪生共用）。 */
export function loadStandardModel(standardPath = STANDARD_PATH, tokensPath = STANDARD_TOKENS_PATH, profile = ANTD_PROFILE, skeletonPath = SKELETON_PATH) {
  const standardText = readFileSync(standardPath, "utf8");
  const tokensText = existsSync(tokensPath) ? readFileSync(tokensPath, "utf8") : null;
  const skeleton = readSkeleton(skeletonPath);
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
  const written = new Map((raw.areas ?? []).map((area) => [area.key, area]));
  for (const key of written.keys()) {
    if (!skeleton.areas.some((area) => area.key === key)) fail(`领域 ${key} 不在骨架里`);
  }

  const areas = skeleton.areas.map((skeletonArea, areaIndex) => {
    const areaRaw = written.get(skeletonArea.key);
    const group = skeletonArea.group;
    const groupTitle = GROUP_TITLES[group];
    if (groupTitle === undefined) fail(`领域 ${skeletonArea.key} 的分区 ${group} 不在词表内`);
    const storybookId = `standard-${storyIdPart(group)}-${storyIdPart(skeletonArea.key)}`;
    const title = `规范/${groupTitle}/${skeletonArea.title_zh}`;
    const rules = (areaRaw?.rules ?? []).map((ruleRaw) => {
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
        jsx: example.jsx ?? null,
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
        showcase: (ruleRaw.showcase ?? []).map((block) => normalizeShowcase(block, tokenGroups)),
        examples,
        storybook: { export: storyExportName(ruleRaw.id), id: `${storybookId}--${storyIdPart(storyExportName(ruleRaw.id))}` },
      };
    });
    const ruleIds = new Set(rules.map((rule) => rule.id));
    const playground = normalizePlayground(areaRaw?.playground);
    return {
      order: areaIndex,
      key: skeletonArea.key,
      title_zh: skeletonArea.title_zh,
      group,
      group_title_zh: groupTitle,
      prefix: skeletonArea.prefix,
      summary_zh: areaRaw?.summary_zh ?? skeletonArea.summary_zh,
      covered: areaRaw !== undefined,
      counterparts: skeletonArea.counterparts ?? null,
      playground,
      topics: (skeletonArea.topics ?? []).map((topic) => ({ id: topic.id, title_zh: topic.title_zh, covered: ruleIds.has(topic.id) })),
      rules,
      storybook: {
        title,
        id: `${storybookId}--overview`,
        playground_id: playground === null ? null : `${storybookId}--playground`,
        matrix_id: playground === null || playground.matrix === null ? null : `${storybookId}--matrix`,
      },
    };
  });

  // token 表只在规范引用了 token（参数、色块取 token，或实时内容写了 t['…']）时进指纹（与 CLI loadDesignStandard 同口径）。
  const usesTokens = (raw.areas ?? []).some((area) =>
    (area.rules ?? []).some((rule) => mentionsTokens(rule.params) || mentionsTokens(rule.showcase) || mentionsTokens(rule.examples)),
  );
  const fingerprint = fingerprintOf([
    { path: FINGERPRINT_STANDARD_PATH, text: standardText },
    ...(tokensText === null || !usesTokens ? [] : [{ path: FINGERPRINT_TOKENS_PATH, text: tokensText }]),
    { path: FINGERPRINT_SKELETON_PATH, text: skeleton.text },
  ]);
  const ctx = {
    fingerprint,
    meta,
    code_lang: profile.code_lang,
    edit_file: profile.source_pointer,
    twin_files: profile.twin_pointers,
    commands: { validate: profile.validate_cmd, regenerate: profile.regenerate_cmd, show: profile.show_cmd },
    sources,
    tokens: usesTokens ? flattenTokens(tokenGroups) : {},
  };
  return {
    fingerprint,
    meta,
    sources,
    specs,
    areas,
    ctx,
    profile,
    inputs: [
      { path: profile.source_pointer, sha256: sha256Hex(normalizeText(standardText)) },
      ...(tokensText === null || !usesTokens ? [] : [{ path: profile.tokens_pointer, sha256: sha256Hex(normalizeText(tokensText)) }]),
      { path: profile.skeleton_pointer, sha256: sha256Hex(normalizeText(skeleton.text)) },
    ],
  };
}

/** 一条规则里全部实时内容的源（有实时内容的示例、演示、对照表里没用 sample_zh 简写的行）。 */
export function liveBodiesOf(rule) {
  const bodies = [];
  rule.examples.forEach((example, index) => {
    if (example.template !== null || example.jsx !== null) bodies.push({ kind: "example", index, row: -1, template: example.template, jsx: example.jsx });
  });
  rule.showcase.forEach((block, index) => {
    if (block.kind === "demo") bodies.push({ kind: "demo", index, row: -1, template: block.template, jsx: block.jsx });
    if (block.kind === "specimen") {
      block.rows.forEach((row, rowIndex) => {
        if (row.sample_zh === null) bodies.push({ kind: "row", index, row: rowIndex, template: row.template, jsx: row.jsx });
      });
    }
  });
  return bodies;
}

/** 一个领域里实时内容用到的图标组件名（模板里的标签 + 参数里的图标名，如动作 → 图标对照表）。 */
export function iconsOfArea(area) {
  const names = new Set();
  const collectValue = (value) => {
    if (typeof value === "string" && ICON_NAME.test(value)) names.add(value);
    else if (Array.isArray(value)) value.forEach(collectValue);
    else if (isRecord(value)) Object.values(value).forEach(collectValue);
  };
  for (const rule of area.rules) {
    const live = liveBodiesOf(rule).filter((body) => body.template !== null);
    for (const body of live) {
      for (const match of body.template.matchAll(ICON_TAG)) names.add(match[1]);
    }
    if (live.length > 0) for (const param of rule.params) collectValue(param.value);
  }
  return [...names].sort();
}

function embed(name, value, type) {
  return `const ${name} = ${JSON.stringify(value, null, 2)} as unknown as ${type};`;
}

export function areaFileName(area, extension = "ts") {
  return `${String(area.order + 1).padStart(3, "0")}-${area.key}.stories.${extension}`;
}

function storyName(rule) {
  return `${rule.id} ${rule.title_zh}`;
}

/** story 文件里嵌入的领域数据（去掉只在生成期用的字段）。 */
export function embeddedArea(area) {
  const data = { ...area };
  delete data.order;
  return data;
}

/** 领域 → CSF3 story 文件文本：「概览」整页 +（组件）实验场、状态矩阵 + 每条规则一个深链 story。 */
export function renderAreaStory(area, model) {
  const icons = iconsOfArea(area);
  const runtime = ["areaPage", "rulePage"];
  if (area.playground !== null) runtime.push("playgroundControls", "playgroundRender");
  if (area.storybook.matrix_id !== null) runtime.push("matrixPage");
  const lines = [
    `// GENERATED by packages/studio/scripts/lib/standard.mjs —— 禁手改（改 ${model.profile.source_pointer} 或骨架后重新生成）。`,
    `// 规范指纹 ${model.fingerprint}`,
    `import type { StoryObj } from '@storybook/vue3';`,
  ];
  if (icons.length > 0) lines.push(`import { ${icons.join(", ")} } from '@ant-design/icons-vue';`);
  lines.push(
    `import { ${runtime.sort().join(", ")} } from '../../src/standard/runtime';`,
    `import type { StdArea, StdContext } from '../../src/standard/runtime';`,
    ``,
    `const ICONS = { ${icons.join(", ")} };`,
    embed("CTX", model.ctx, "StdContext"),
    embed("AREA", embeddedArea(area), "StdArea"),
    ``,
    `const meta = {`,
    `  title: ${JSON.stringify(area.storybook.title)},`,
    `  id: ${JSON.stringify(area.storybook.id.replace(/--overview$/, ""))},`,
    `  parameters: {`,
    `    layout: 'fullscreen',`,
    `    docs: { description: { component: ${JSON.stringify(`${area.summary_zh}（规范源 ${model.profile.source_pointer}，规范指纹 ${model.fingerprint}）`)} } },`,
    `  },`,
    `};`,
    `export default meta;`,
    ``,
    `export const Overview: StoryObj = {`,
    `  name: ${JSON.stringify(area.covered ? "概览" : area.title_zh)},`,
    `  render: () => ({ components: { StdPage: areaPage(AREA, CTX, ICONS) }, template: '<StdPage />' }),`,
    `};`,
  );
  if (area.playground !== null) {
    lines.push(
      ``,
      `export const Playground: StoryObj = {`,
      `  name: '实验场',`,
      `  ...playgroundControls(AREA.playground!),`,
      `  parameters: { layout: 'fullscreen', controls: { expanded: true } },`,
      `  render: (args) => ({ components: { StdPage: playgroundRender(AREA)(args) }, template: '<StdPage />' }),`,
      `};`,
    );
  }
  if (area.storybook.matrix_id !== null) {
    lines.push(
      ``,
      `export const Matrix: StoryObj = {`,
      `  name: '状态矩阵',`,
      `  render: () => ({ components: { StdPage: matrixPage(AREA, CTX) }, template: '<StdPage />' }),`,
      `};`,
    );
  }
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

/** 总览页用的领域摘要（含待补的领域）。 */
export function overviewAreas(model) {
  return model.areas.map((area) => ({
    key: area.key,
    title_zh: area.title_zh,
    group: area.group,
    group_title_zh: area.group_title_zh,
    summary_zh: area.summary_zh,
    covered: area.covered,
    rules: area.rules.length,
    gate: area.rules.filter((rule) => rule.enforcement.kind === "gate").length,
    review: area.rules.filter((rule) => rule.enforcement.kind === "review").length,
    pending: area.rules.reduce((sum, rule) => sum + rule.params.filter((param) => param.pending).length, 0),
    todo: area.covered ? area.topics.filter((topic) => !topic.covered).length : area.topics.length,
    storybook_id: area.storybook.id,
  }));
}

/** 总览 story 文件文本。 */
export function renderOverviewStory(model) {
  return [
    `// GENERATED by packages/studio/scripts/lib/standard.mjs —— 禁手改（改 ${model.profile.source_pointer} 或骨架后重新生成）。`,
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

/** 生成规范 story（返回 { count, files, areas, covered, rules }）。 */
export function generateStandardPages(outDir, model = loadStandardModel()) {
  if (!outDir) throw new Error("generateStandardPages 需要显式 outDir（generate-all 注入）");
  resetDir(outDir);
  const files = [];
  const overview = join(outDir, "000-overview.stories.ts");
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
    covered: model.areas.filter((area) => area.covered).length,
    rules: model.areas.reduce((sum, area) => sum + area.rules.length, 0),
  };
}

// ── AI 孪生 ──────────────────────────────────────────────────────────────────

/** 页面地址：有在线 Storybook 时给完整链接，否则给本地 Storybook 的相对路径。 */
export function storyUrl(model, id) {
  return `${model.profile.storybook_base_url ?? ""}?path=/story/${id}`;
}

/** 孪生 JSON（确定性输出：无时间戳，键序固定）。 */
export function renderTwinJson(model) {
  const twin = {
    schema: TWIN_SCHEMA,
    note_zh: `Storybook「规范」分区的 AI 可读孪生，与页面同源同指纹。不要手改：改规范源或骨架后运行 ${model.profile.regenerate_cmd}。covered=false 的领域与条目是骨架里有、本体系还没写的（页面显示「待补」）。`,
    fingerprint: model.fingerprint,
    generator: { path: model.profile.generator_path, version: STANDARD_GENERATOR_VERSION },
    inputs: model.inputs,
    edit: {
      source: model.profile.source_pointer,
      skeleton: model.profile.skeleton_pointer,
      validate: model.profile.validate_cmd,
      regenerate: model.profile.regenerate_cmd,
      show: model.profile.show_cmd,
    },
    meta: model.meta,
    storybook: { base_url: model.profile.storybook_base_url, overview: storyUrl(model, "standard-overview--overview") },
    checks: Object.entries(CHECK_TITLES).map(([id, title_zh]) => ({ id, title_zh, active: ACTIVE_CHECKS.has(id) })),
    areas: model.areas.map((area) => ({
      key: area.key,
      title_zh: area.title_zh,
      group: area.group,
      group_title_zh: area.group_title_zh,
      prefix: area.prefix,
      summary_zh: area.summary_zh,
      covered: area.covered,
      counterparts: area.counterparts,
      playground: area.playground,
      topics: area.topics,
      storybook: {
        title: area.storybook.title,
        id: area.storybook.id,
        url: storyUrl(model, area.storybook.id),
        playground: area.storybook.playground_id === null ? null : storyUrl(model, area.storybook.playground_id),
        matrix: area.storybook.matrix_id === null ? null : storyUrl(model, area.storybook.matrix_id),
      },
      rules: area.rules.map((rule) => ({
        id: rule.id,
        title_zh: rule.title_zh,
        statement_zh: rule.statement_zh,
        rationale_zh: rule.rationale_zh,
        surfaces: rule.surfaces,
        enforcement: rule.enforcement,
        params: rule.params,
        anchors: rule.anchors,
        showcase: rule.showcase,
        examples: rule.examples,
        storybook: { id: rule.storybook.id, url: storyUrl(model, rule.storybook.id) },
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

function mdShowcase(block) {
  if (block.kind === "demo") return [`- 演示：${block.title_zh}${block.description_zh === null ? "" : `——${block.description_zh}`}`];
  if (block.kind === "lab") return [`- 实验 \`${block.lab}\`：${block.title_zh}${block.description_zh === null ? "" : `——${block.description_zh}`}`];
  if (block.kind === "specimen") {
    const head = `- 对照表${block.title_zh === null ? "" : `「${block.title_zh}」`}（${block.name_label_zh ?? "名称"} → 用途）：`;
    return [head, ...block.rows.map((row) => `  - \`${row.name}\`${row.usage_zh === null ? "" : `：${row.usage_zh}`}`)];
  }
  const head = `- 色板${block.title_zh === null ? "" : `「${block.title_zh}」`}：`;
  return [
    head,
    ...block.scales.map(
      (scale) =>
        `  - ${scale.label_zh ?? scale.name}（${scale.name}）：${scale.swatches
          .map((swatch) => `${swatch.name} ${swatch.value ?? `（${swatch.pending_zh ?? "待定"}）`}${swatch.usage_zh === null ? "" : ` ${swatch.usage_zh}`}`)
          .join("；")}`,
    ),
  ];
}

/** 孪生 Markdown 摘要（给 AI 直接读：一条规则一节，条文 + 数值 + 演示 + 执行方式 + 依据 + 页面地址；待补的领域列在后面）。 */
export function renderTwinMarkdown(model) {
  const out = [
    `# 前端设计规范（${model.meta.design_system_title_zh}，${model.meta.ui_library}）`,
    ``,
    `> Storybook「规范」分区的 AI 可读孪生，由 ${model.profile.generator_path} 生成，与页面同源。不要手改。`,
    `> 规范指纹 \`${model.fingerprint}\`；状态 origin=${model.meta.origin}。`,
    `> 修改规范：编辑 \`${model.profile.source_pointer}\` → \`${model.profile.validate_cmd}\` → \`${model.profile.regenerate_cmd}\`；目录（领域与条目）由骨架 \`${model.profile.skeleton_pointer}\` 统一。`,
    `> 机器门禁规则违反即拦截（检查未接入时按评审执行）；人工评审规则在评审时逐条核对。标「待补」的是骨架里有、本体系还没写的：开发时参照另一套体系的同名页，并在评审时说明。`,
    ``,
  ];
  for (const area of model.areas.filter((item) => item.covered)) {
    out.push(`## ${area.group_title_zh} / ${area.title_zh}（${area.prefix}）`, ``, area.summary_zh, ``, `页面：${storyUrl(model, area.storybook.id)}`);
    if (area.counterparts !== null) {
      out.push(`对应组件：${Object.entries(area.counterparts).map(([system, names]) => `${system} ${names.length === 0 ? "（无）" : names.join("、")}`).join("；")}`);
    }
    if (area.playground !== null) {
      out.push(
        `实验场：\`${area.playground.component}\`，属性 ${area.playground.props
          .map((prop) => (prop.kind === "options" ? `${prop.key}=${prop.options.join("|")}` : `${prop.key}=布尔`))
          .join("，")}${area.storybook.playground_id === null ? "" : `（${storyUrl(model, area.storybook.playground_id)}）`}`,
      );
    }
    out.push(``);
    const byId = new Map(area.rules.map((rule) => [rule.id, rule]));
    for (const topic of area.topics) {
      const rule = byId.get(topic.id);
      if (rule === undefined) {
        out.push(`### ${topic.id} ${topic.title_zh}（待补）`, ``);
        continue;
      }
      const enforcement =
        rule.enforcement.kind === "gate"
          ? `机器门禁 \`${rule.enforcement.check}\`${rule.enforcement.active ? "" : "（待接入，暂按评审执行）"}`
          : "人工评审";
      const surfaces = rule.surfaces.length === 2 ? "管理侧与用户侧" : rule.surfaces.map((s) => (s === "admin" ? "管理侧" : "用户侧")).join("、");
      out.push(`### ${rule.id} ${rule.title_zh}`, ``, rule.statement_zh, ``, `- 执行：${enforcement}；适用：${surfaces}`);
      for (const param of rule.params) out.push(`- 参数：${mdParam(param, model.sources)}`);
      for (const block of rule.showcase) out.push(...mdShowcase(block));
      for (const anchor of rule.anchors) out.push(`- 硬规范依据：specs/hard/${anchor.doc}「${anchor.quote}」`);
      for (const example of rule.examples) {
        const kind = example.kind === "do" ? "这样做" : "别这样做";
        out.push(`- 示例（${kind}）：${example.title_zh}${example.note_zh === null ? "" : `——${example.note_zh}`}`);
      }
      out.push(`- 页面：${storyUrl(model, rule.storybook.id)}`, ``);
    }
  }
  const todo = model.areas.filter((area) => !area.covered);
  if (todo.length > 0) {
    out.push(`## 待补的领域（${todo.length} 个）`, ``);
    for (const area of todo) {
      const counterparts =
        area.counterparts === null ? "" : `；对应组件 ${Object.entries(area.counterparts).map(([system, names]) => `${system} ${names.length === 0 ? "（无）" : names.join("、")}`).join("，")}`;
      out.push(`- ${area.group_title_zh} / ${area.title_zh}（\`${area.key}\`，前缀 ${area.prefix}）：${area.summary_zh}${counterparts}`);
    }
    out.push(``);
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
