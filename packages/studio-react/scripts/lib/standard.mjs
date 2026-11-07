// React 画廊「规范」分区生成器（Vercel Geist 预设）。
//
// 与 Vue 画廊（packages/studio/scripts/lib/standard.mjs）同一个装载器、同一个呈现模型、同一个页面构建器
// （packages/studio/src/standard/page.ts）、同一套孪生渲染，只换档案（规范源 = packages/cli/seeds/design-standards/geist.yaml）
// 和实时位的组件：
//   1. 人看的 Storybook 页面：generated/standard/*.stories.tsx（不入库，dev/build 前重建）；
//      规范源里每段 jsx（示例、演示、对照表的行）被编译成一个 React 组件，参数 p 取本条规则已定的值；
//   2. AI 读的孪生：twin/design-standard.geist.json + .md（入库，tests/standard.spec.ts 钉新鲜度）。
//
// 实时内容只能用登记过的组件（src/components/ui 下的组件）和 lucide-react 图标（XxxIcon 命名）；
// 出现没登记的组件标签直接生成失败，不带病产出。
import { join } from "node:path";
import { REPO_ROOT, resetDir, writeFileEnsuringDir } from "../../../studio/scripts/lib/common.mjs";
import {
  SKELETON_PATH,
  SKELETON_POINTER,
  STANDARD_TOKENS_PATH,
  STANDARD_TOKENS_POINTER,
  STORYBOOK_SITE_URL,
  areaFileName,
  embeddedArea,
  liveBodiesOf,
  loadStandardModel,
  overviewAreas,
  renderTwinJson,
  renderTwinMarkdown,
} from "../../../studio/scripts/lib/standard.mjs";
import { STUDIO_REACT_ROOT } from "./paths.mjs";

export const GEIST_STANDARD_POINTER = "packages/cli/seeds/design-standards/geist.yaml";
export const GEIST_STANDARD_PATH = join(REPO_ROOT, ...GEIST_STANDARD_POINTER.split("/"));
export const GEIST_TWIN_DIR = join(STUDIO_REACT_ROOT, "twin");
export const GEIST_TWIN_JSON = "design-standard.geist.json";
export const GEIST_TWIN_MD = "design-standard.geist.md";

/** 呈现档案（在线发布位：总 Storybook 的 react/ 子路径）。 */
export const GEIST_PROFILE = {
  source_pointer: GEIST_STANDARD_POINTER,
  tokens_pointer: STANDARD_TOKENS_POINTER,
  skeleton_pointer: SKELETON_POINTER,
  twin_pointers: [`packages/studio-react/twin/${GEIST_TWIN_JSON}`, `packages/studio-react/twin/${GEIST_TWIN_MD}`],
  storybook_base_url: `${STORYBOOK_SITE_URL}react/`,
  generator_path: "packages/studio-react/scripts/lib/standard.mjs",
  code_lang: "JSX",
  validate_cmd: "pomaster design validate --system geist",
  regenerate_cmd: "node packages/studio-react/run.mjs generate",
  show_cmd: "pomaster design show --system geist --json",
};

/** 实时内容可用的组件 → 所在模块（src/components/ui/<模块>.tsx）。 */
export const UI_COMPONENTS = {
  Alert: "alert",
  AlertTitle: "alert",
  AlertDescription: "alert",
  Badge: "badge",
  Button: "button",
  ButtonLink: "button",
  Card: "card",
  CardHeader: "card",
  CardTitle: "card",
  CardDescription: "card",
  CardContent: "card",
  CardFooter: "card",
  Checkbox: "checkbox",
  Dialog: "dialog",
  DialogTrigger: "dialog",
  DialogContent: "dialog",
  DialogHeader: "dialog",
  DialogFooter: "dialog",
  DialogTitle: "dialog",
  DialogDescription: "dialog",
  DialogClose: "dialog",
  DropdownMenu: "dropdown-menu",
  DropdownMenuTrigger: "dropdown-menu",
  DropdownMenuContent: "dropdown-menu",
  DropdownMenuItem: "dropdown-menu",
  DropdownMenuLabel: "dropdown-menu",
  DropdownMenuSeparator: "dropdown-menu",
  Input: "input",
  Label: "label",
  NumberTicker: "number-ticker",
  Popover: "popover",
  PopoverTrigger: "popover",
  PopoverClose: "popover",
  PopoverContent: "popover",
  Progress: "progress",
  RadioGroup: "radio-group",
  RadioGroupItem: "radio-group",
  Select: "select",
  SelectTrigger: "select",
  SelectValue: "select",
  SelectContent: "select",
  SelectItem: "select",
  Separator: "separator",
  Skeleton: "skeleton",
  Switch: "switch",
  Table: "table",
  TableHeader: "table",
  TableBody: "table",
  TableFooter: "table",
  TableRow: "table",
  TableHead: "table",
  TableCell: "table",
  TableCaption: "table",
  Tabs: "tabs",
  TabsList: "tabs",
  TabsTrigger: "tabs",
  TabsContent: "tabs",
  Tooltip: "tooltip",
  TooltipTrigger: "tooltip",
  TooltipContent: "tooltip",
  TooltipProvider: "tooltip",
};
const ICON_COMPONENT = /^[A-Z][A-Za-z0-9]*Icon$/;
const COMPONENT_TAG = /<([A-Z][A-Za-z0-9]*)\b/g;
const FORBIDDEN = /^\s*(import|export)\b/m;

/** 装载 Geist 预设 → 呈现模型。 */
export function loadGeistModel(standardPath = GEIST_STANDARD_PATH, tokensPath = STANDARD_TOKENS_PATH, skeletonPath = SKELETON_PATH) {
  return loadStandardModel(standardPath, tokensPath, GEIST_PROFILE, skeletonPath);
}

function fail(message) {
  throw new Error(`[standard-react] ${message}`);
}

/** 一段 JSX 用到的组件：UI 组件（按模块归组）与图标。未登记的组件标签直接失败。 */
export function componentsOfJsx(jsx, where = "示例") {
  const ui = new Set();
  const icons = new Set();
  for (const match of jsx.matchAll(COMPONENT_TAG)) {
    const name = match[1];
    if (name in UI_COMPONENTS) ui.add(name);
    else if (ICON_COMPONENT.test(name)) icons.add(name);
    else fail(`${where} 用了没登记的组件 <${name}>（可用：${Object.keys(UI_COMPONENTS).join("、")}，以及 lucide-react 的 XxxIcon 图标）`);
  }
  return { ui, icons };
}

function embed(name, value, type) {
  return `const ${name} = ${JSON.stringify(value, null, 2)} as unknown as ${type};`;
}

function storyName(rule) {
  return `${rule.id} ${rule.title_zh}`;
}

function indent(text, spaces) {
  const pad = " ".repeat(spaces);
  return text
    .replace(/\s+$/, "")
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : `${pad}${line}`))
    .join("\n");
}

/** 规则里已定参数的取值表（实时内容里的 p）；待定参数不进表，CLI 校验已保证实时内容不引用它们。 */
function settledParams(rule) {
  const out = {};
  for (const param of rule.params) if (!param.pending) out[param.key] = param.value;
  return out;
}

function headerLines(model) {
  return [
    `// GENERATED by packages/studio-react/scripts/lib/standard.mjs —— 禁手改（改 ${model.profile.source_pointer} 或骨架后重新生成）。`,
    `// 规范指纹 ${model.fingerprint}`,
  ];
}

function liveKeyOf(rule, body) {
  if (body.kind === "example") return `ex:${rule.id}:${body.index}`;
  if (body.kind === "demo") return `demo:${rule.id}:${body.index}`;
  return `row:${rule.id}:${body.index}:${body.row}`;
}

function functionNameOf(ruleIndex, body) {
  const suffix = body.kind === "row" ? `${body.index}_${body.row}` : `${body.index}`;
  return `Live_${ruleIndex}_${body.kind}_${suffix}`;
}

/** 实验场组件的 JSX（状态矩阵的一格、实验场 story 共用）。 */
function playgroundJsx(playground, spread) {
  if (!(playground.component in UI_COMPONENTS)) fail(`实验场组件 ${playground.component} 没登记（可用：${Object.keys(UI_COMPONENTS).join("、")}）`);
  return `<${playground.component} {...${spread}}>{${JSON.stringify(playground.text_zh ?? "")}}</${playground.component}>`;
}

/** 领域 → CSF3 story 文件文本（TSX）：「概览」整页 +（组件）实验场、状态矩阵 + 每条规则一个深链 story。 */
export function renderAreaStoryReact(area, model) {
  const ui = new Set();
  const icons = new Set();
  const blocks = [];
  const liveEntries = [];
  let usesState = false;
  area.rules.forEach((rule, ruleIndex) => {
    let paramsDeclared = false;
    for (const body of liveBodiesOf(rule)) {
      const where = `${rule.id} 的${body.kind === "example" ? `第 ${body.index + 1} 个示例` : body.kind === "demo" ? `第 ${body.index + 1} 个演示` : `第 ${body.index + 1} 个对照表第 ${body.row + 1} 行`}`;
      if (body.jsx === null) {
        if (body.template !== null) fail(`${where} 只有 Vue 模板，React 画廊需要 jsx`);
        continue;
      }
      if (FORBIDDEN.test(body.jsx)) fail(`${where} 里不能有 import / export`);
      const used = componentsOfJsx(body.jsx, where);
      used.ui.forEach((name) => ui.add(name));
      used.icons.forEach((name) => icons.add(name));
      const usesP = /\bp\./.test(body.jsx);
      const usesT = /\bt\[/.test(body.jsx);
      const usesS = /\bs\./.test(body.jsx);
      const usesSet = /\bset\(/.test(body.jsx);
      if (usesS || usesSet) usesState = true;
      if (usesP && !paramsDeclared) {
        blocks.push(`const P_${ruleIndex}: Record<string, any> = ${JSON.stringify(settledParams(rule))};`);
        paramsDeclared = true;
      }
      const name = functionNameOf(ruleIndex, body);
      blocks.push(
        `function ${name}() {`,
        ...(usesP ? [`  const p = P_${ruleIndex};`] : []),
        ...(usesT ? [`  const t: Record<string, any> = CTX_TOKENS;`] : []),
        ...(usesS || usesSet ? [`  const [${usesS ? "s" : ""}${usesSet ? ", setS" : ""}] = useState<Record<string, any>>({});`] : []),
        ...(usesSet ? [`  const set = (patch: Record<string, any>) => setS((prev) => ({ ...prev, ...patch }));`] : []),
        `  return (`,
        `    <>`,
        indent(body.jsx, 6),
        `    </>`,
        `  );`,
        `}`,
      );
      liveEntries.push(`  ${JSON.stringify(liveKeyOf(rule, body))}: ${name},`);
    }
  });
  if (area.playground !== null) ui.add(area.playground.component);

  const usesTokens = blocks.some((line) => line.includes("CTX_TOKENS"));
  const runtime = ["AreaPage", "RulePage"];
  if (area.playground !== null) runtime.push("PlaygroundFrame", "playgroundControls");
  if (area.storybook.matrix_id !== null) runtime.push("MatrixPage");
  const types = ["StdArea", "StdContext", "StdLiveMap"];
  if (area.playground !== null) types.push("StdCell");
  const lines = [...headerLines(model), `import type { Meta, StoryObj } from '@storybook/react';`];
  if (usesState) lines.push(`import { useState } from 'react';`);
  const byModule = new Map();
  for (const name of [...ui].sort()) {
    const module = UI_COMPONENTS[name];
    byModule.set(module, [...(byModule.get(module) ?? []), name]);
  }
  for (const [module, names] of [...byModule.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`import { ${names.join(", ")} } from '../../src/components/ui/${module}';`);
  }
  if (icons.size > 0) lines.push(`import { ${[...icons].sort().join(", ")} } from 'lucide-react';`);
  lines.push(
    `import { ${runtime.sort().join(", ")} } from '../../src/standard/runtime';`,
    `import type { ${types.join(", ")} } from '../../src/standard/runtime';`,
    ``,
    embed("CTX", model.ctx, "StdContext"),
    embed("AREA", embeddedArea(area), "StdArea"),
  );
  if (usesTokens) lines.push(`const CTX_TOKENS = (CTX as unknown as { tokens: Record<string, any> }).tokens;`);
  lines.push(``, ...blocks, ``, `const LIVE: StdLiveMap = {`, ...liveEntries, `};`);
  if (area.playground !== null) {
    lines.push(``, `const CELL: StdCell = (values) => ${playgroundJsx(area.playground, "values")};`);
  }
  lines.push(
    ``,
    `const meta: Meta = {`,
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
    `  render: () => <AreaPage area={AREA} ctx={CTX} live={LIVE}${area.playground !== null ? " cell={CELL}" : ""} />,`,
    `};`,
  );
  if (area.playground !== null) {
    lines.push(
      ``,
      `export const Playground: StoryObj = {`,
      `  name: '实验场',`,
      `  ...playgroundControls(AREA.playground!),`,
      `  parameters: { layout: 'fullscreen', controls: { expanded: true } },`,
      `  render: (args) => <PlaygroundFrame area={AREA}>${playgroundJsx(area.playground, "(args as Record<string, any>)")}</PlaygroundFrame>,`,
      `};`,
    );
  }
  if (area.storybook.matrix_id !== null) {
    lines.push(``, `export const Matrix: StoryObj = {`, `  name: '状态矩阵',`, `  render: () => <MatrixPage area={AREA} ctx={CTX} cell={CELL} />,`, `};`);
  }
  area.rules.forEach((rule, index) => {
    lines.push(
      ``,
      `export const ${rule.storybook.export}: StoryObj = {`,
      `  name: ${JSON.stringify(storyName(rule))},`,
      `  render: () => <RulePage rule={AREA.rules[${index}]!} area={AREA} ctx={CTX} live={LIVE} />,`,
      `};`,
    );
  });
  lines.push("");
  return lines.join("\n");
}

/** 总览 story 文件文本（TSX）。 */
export function renderOverviewStoryReact(model) {
  return [
    ...headerLines(model),
    `import type { Meta, StoryObj } from '@storybook/react';`,
    `import { OverviewPage } from '../../src/standard/runtime';`,
    `import type { StdContext, StdOverviewArea } from '../../src/standard/runtime';`,
    ``,
    embed("CTX", model.ctx, "StdContext"),
    embed("AREAS", overviewAreas(model), "StdOverviewArea[]"),
    ``,
    `const meta: Meta = {`,
    `  title: '规范/总览',`,
    `  id: 'standard-overview',`,
    `  parameters: { layout: 'fullscreen' },`,
    `};`,
    `export default meta;`,
    ``,
    `export const Overview: StoryObj = {`,
    `  name: '总览',`,
    `  render: () => <OverviewPage ctx={CTX} areas={AREAS} />,`,
    `};`,
    ``,
  ].join("\n");
}

/** 生成规范 story（返回 { count, files, areas, covered, rules }）。 */
export function generateStandardPagesReact(outDir, model = loadGeistModel()) {
  if (!outDir) throw new Error("generateStandardPagesReact 需要显式 outDir（generate-all 注入）");
  resetDir(outDir);
  const files = [];
  const overview = join(outDir, "000-overview.stories.tsx");
  writeFileEnsuringDir(overview, renderOverviewStoryReact(model));
  files.push(overview);
  for (const area of model.areas) {
    const target = join(outDir, areaFileName(area, "tsx"));
    writeFileEnsuringDir(target, renderAreaStoryReact(area, model));
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

/** 写 Geist 孪生（run.mjs generate 调用）。 */
export function writeGeistTwin(twinDir = GEIST_TWIN_DIR, model = loadGeistModel()) {
  writeFileEnsuringDir(join(twinDir, GEIST_TWIN_JSON), renderTwinJson(model));
  writeFileEnsuringDir(join(twinDir, GEIST_TWIN_MD), renderTwinMarkdown(model));
  return { fingerprint: model.fingerprint, files: [join(twinDir, GEIST_TWIN_JSON), join(twinDir, GEIST_TWIN_MD)] };
}
