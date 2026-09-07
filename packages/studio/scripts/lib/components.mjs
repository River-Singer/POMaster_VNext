// antdv 真渲染组件目录 story 生成器（G-A · 四类页面之二：71 组件族基础渲染 story）。
//
// 枚举路径（研究 §6 实抓裁定）：静态解析 node_modules 内
// ant-design-vue/es/components.js 的 export 行（4.2.6 无 exports 字段 → 深路径不受
// export map 限制）。该文件 71 条 export 行 = 71 个组件族（antdv 官方组件目录口径；
// 「71 组件」分母）——主组件（default as X）+ 同族子导出（AnchorLink/FormItem 等，
// 4.2.6 实抓共 138 具名导出）。version/theme/cssinjs/install 等非组件导出住在
// es/index.js 增量里、天然不在本文件（研究 §6），过滤面由此归零。
//
// 组合裁定（审计 N4 修复）：按组件族声明最小合法组合——示例模板来自
// family-examples.mjs（声明式配置表：curated/default/service/utility 四类）。
// 子导出（MenuItem/TabPane/ButtonGroup…）一律在父级组合的内部结构中渲染，
// 绝不兄弟裸挂载（MenuItem 等依赖 Menu 注入上下文，裸挂载即
// "Cannot destructure property 'prefixCls'" 崩溃——审计浏览器实测复现）。
//
// 真渲染裁定：每族一个基础渲染 story（CSF3 render 形态 A：component options +
// template 字符串，官方模板原文形态，研究 §3）；antdv 全局注册走 preview.ts 的
// setup(app => app.use(Antd))（vue3-vite 框架页原文钩子），story 另做局部注册双保险。
//
// 交互态矩阵（S1 · Owner 裁定 09-06）：配置表族级 states 数组 → 生成器循环产出
// 多 story（Default 之外每态一个具名导出，如 Disabled/Loading/Sizes/Variants）。
// 词形纪律：state 模板 prop 全部为 antdv 4.2.6 官方 API（types 实抓核定，
// 不发明 prop）；服务式 API（message/notification）不产 states。
//
// 语义反向映射（S4 · Owner 裁定 09-06 候选 B）：组件 docs 描述追加「服务场景」
// 注记——由 archetype-component-map.json 反向派生（正向=archetypes.mjs 渲染
// 「建议组件组合」节），只读渲染、NON-AUTHORITATIVE。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANTDV_COMPONENTS_JS,
  resetDir,
  writeFileEnsuringDir,
} from "./common.mjs";
import { FAMILY_EXAMPLES } from "./family-examples.mjs";
import {
  deriveReverseMap,
  readArchetypeComponentMap,
} from "./archetype-map.mjs";

/** 基础渲染时补默认 slot 文本的导出名（仅限裸挂载可呈现内容的叶子件——生成器数据，非逐个手写 story）。 */
const SLOT_TEXT_BY_NAME = new Map([
  ["Button", "按钮"],
  ["Tag", "标签"],
  ["CheckableTag", "可选中标签"],
  ["Typography", "排版基础"],
  ["TypographyTitle", "标题"],
  ["TypographyParagraph", "文本段落"],
  ["TypographyText", "文本"],
  ["TypographyLink", "链接"],
  ["BreadcrumbItem", "面包屑"],
  ["MenuItem", "菜单项"],
  ["TabPane", "标签页"],
  ["TimelineItem", "时间线节点"],
]);

/** 交互态 story 导出名词形（CSF3 具名导出）；Default 为基础渲染保留名。 */
const STATE_NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;

/** 校验单个交互态声明（结构 fail-closed：坏声明生成期即抛错，不带病产出）。 */
function validateState(family, state) {
  if (!state || typeof state.name !== "string" || !STATE_NAME_PATTERN.test(state.name)) {
    throw new Error(
      `族 ${family.primary} 的 state.name 非法（需 ${STATE_NAME_PATTERN} 词形）: ${JSON.stringify(state?.name)}`,
    );
  }
  if (state.name === "Default") {
    throw new Error(`族 ${family.primary} 的 state.name "Default" 与基础渲染导出冲突`);
  }
  if (typeof state.template !== "string" || state.template.trim().length === 0) {
    throw new Error(`族 ${family.primary} 的 state ${state.name} 缺 template`);
  }
}

/** 族全部交互态（缺省空数组——service 族不产 states）。 */
export function familyStates(family) {
  const entry = FAMILY_EXAMPLES.get(family.primary);
  if (!entry || !Array.isArray(entry.states) || entry.states.length === 0) return [];
  for (const state of entry.states) validateState(family, state);
  return entry.states;
}

/** 71 族 × 全部 states 的 story 总数（分母钉测消费）。 */
export function countAllStories(families) {
  return families.reduce((sum, family) => sum + 1 + familyStates(family).length, 0);
}

/**
 * 解析 antdv es/components.js 的组件族（文件序，确定性）。
 * 行形态（4.2.6 实抓，71 行）：`export { default as X, Y } from './x';`——
 * 首个具名导出 = 族主组件（antdv 默认导出语义），其余 = 同族子导出。
 */
export function parseAntdvComponentFamilies(componentsJsContent) {
  const families = [];
  const seenPrimary = new Set();
  const exportPattern = /^export\s*\{([^}]+)\}\s*from\s*'([^']+)';$/;
  for (const line of componentsJsContent.split("\n")) {
    const match = exportPattern.exec(line.trim());
    if (!match) continue;
    const names = match[1]
      .split(",")
      .map((token) => {
        const trimmed = token.trim();
        return trimmed.startsWith("default as ") ? trimmed.slice("default as ".length) : trimmed;
      });
    for (const name of names) {
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
        throw new Error(`antdv components.js 出现非标识符导出名: ${JSON.stringify(name)}`);
      }
    }
    const primary = names[0];
    if (seenPrimary.has(primary)) {
      throw new Error(`antdv components.js 主导出名重复: ${primary}`);
    }
    seenPrimary.add(primary);
    families.push({ primary, secondary: names.slice(1), module: match[2] });
  }
  if (families.length === 0) {
    throw new Error("antdv components.js 解析出 0 个组件族——文件形态变化？");
  }
  return families;
}

/** 族内单个导出名的模板元素（slot 文本叶子件补默认内容，其余裸挂载）。 */
function templateElement(name) {
  const slotText = SLOT_TEXT_BY_NAME.get(name);
  return slotText ? `<${name}>${slotText}</${name}>` : `<${name} />`;
}

/** story 渲染体的公共位（组件注册 + 模板；setupData 在座时补 setup）。 */
function renderBody(componentNames, template, setupData) {
  const lines = [
    `  render: () => ({`,
    `    components: { ${componentNames.join(", ")} },`,
  ];
  if (setupData) {
    lines.push(`    setup() {`, `      return ${setupData.trim()};`, `    },`);
  }
  lines.push(`    template: ${JSON.stringify(template)},`, `  }),`);
  return lines;
}

/** 「服务场景」反向映射注记（S4；reverseMap 缺条目返回空串）。 */
export function serviceSceneNote(primary, reverseMap) {
  const scenes = reverseMap.get(primary);
  if (!scenes || scenes.length === 0) return "";
  const slugs = scenes.map((scene) => scene.archetype.replace(/^archetype\./, "").replace(/\.json$/, ""));
  const shown = slugs.slice(0, 5).join("、");
  const more = slugs.length > 5 ? ` 等 ${slugs.length} 卡` : "";
  return ` 服务场景（archetype 反向映射）：${shown}${more}——见 Archetype 语义卡「建议组件组合」。`;
}

/** 单组件族 → CSF3 story 文本（形态由 family-examples.mjs 配置表裁定；含 states 多导出）。 */
export function renderComponentStory(family, reverseMap) {
  const { primary, secondary } = family;
  const entry = FAMILY_EXAMPLES.get(primary);
  const kind = entry?.kind ?? "default";
  const states = familyStates(family);
  const header = [
    `// GENERATED by packages/studio/scripts/lib/components.mjs —— 禁手改（重跑生成器覆盖）。`,
    `// 源：node_modules/ant-design-vue/es/components.js export 行（版本钉 4.2.6，族 ${family.module}）。`,
    `// NON-AUTHORITATIVE：画廊基础渲染呈现，权威语义以 catalog/seeds 锚定源为准（G-D：业务零出现）。`,
    `import type { Meta, StoryObj } from '@storybook/vue3';`,
  ];

  // 组合形态（curated/utility/default）：族导出 + 跨族组合导入 + 全部 states 额外导入，
  // 去重保序（import 是文件级——states 与 Default 共享）。
  const stateExtraImports = states.flatMap((state) => state.extraImports ?? []);
  const importNames = [
    ...new Set([primary, ...secondary, ...(entry?.extraImports ?? []), ...stateExtraImports]),
  ];
  const importStatement = `import { ${importNames.join(", ")} } from 'ant-design-vue';`;

  const sceneNote = serviceSceneNote(primary, reverseMap);

  if (kind === "service") {
    // 服务式 API：真实调用演示（挂载的是触发按钮，点击调 message/notification）；
    // S1 态矩阵不适用于服务式 API（无组件态），states 恒空。
    return [
      ...header,
      importStatement,
      ``,
      `const meta = {`,
      `  title: 'AntDV 组件/${primary}',`,
      `  parameters: {`,
      `    docs: { description: { component: '${primary} 是服务式 API（非组件）——画廊以触发按钮做真实调用演示。${sceneNote}' } },`,
      `  },`,
      `};`,
      `export default meta;`,
      ``,
      `export const Default: StoryObj = {`,
      `  render: () => ({`,
      `    setup() {`,
      `      const trigger = () => {`,
      `        ${primary}.info('POMaster 画廊演示：${primary} 服务式 API');`,
      `      };`,
      `      return { trigger };`,
      `    },`,
      `    template: '<div class="studio-demo"><button class="studio-demo-trigger" @click="trigger">触发 ${primary}（服务式 API）</button></div>',`,
      `  }),`,
      `};`,
      ``,
    ].join("\n");
  }

  if (kind === "curated" || kind === "utility") {
    const kindNote =
      kind === "utility"
        ? `${primary} 是工具命名空间导出（非可挂载组件）——画廊以组合演示其语义。`
        : `最小合法组合（配置：scripts/lib/family-examples.mjs）。`;
    const siblingNote =
      secondary.length > 0 ? ` 同族导出在父级组合内部渲染：${secondary.join("、")}。` : "";
    const stateNote =
      states.length > 0 ? ` 交互态矩阵（S1）：${states.map((state) => state.name).join("、")}。` : "";
    const docsLine = `    docs: { description: { component: 'ant-design-vue 4.2.6 ${kindNote}${siblingNote}${stateNote}${sceneNote}' } },`;
    const metaLines =
      kind === "utility"
        ? [
            `const meta = {`,
            `  title: 'AntDV 组件/${primary}',`,
            `  parameters: {`,
            docsLine,
            `  },`,
            `};`,
          ]
        : [
            `const meta = {`,
            `  title: 'AntDV 组件/${primary}',`,
            `  component: ${primary},`,
            `  parameters: {`,
            docsLine,
            `  },`,
            `} satisfies Meta<typeof ${primary}>;`,
          ];
    const body = [
      ...header,
      importStatement,
      ``,
      ...metaLines,
      `export default meta;`,
      ``,
      `export const Default: StoryObj = {`,
      ...renderBody(importNames, `<div class="studio-demo">${entry.template}</div>`, entry.setupData),
      `};`,
    ];
    for (const state of states) {
      body.push(
        ``,
        `export const ${state.name}: StoryObj = {`,
        ...renderBody(
          importNames,
          `<div class="studio-demo">${state.template}</div>`,
          state.setupData ?? entry.setupData,
        ),
        `};`,
      );
    }
    body.push(``, ``);
    return body.join("\n");
  }

  // default：无必需 props 的叶子族——主/子导出各自独立合法（family-examples.mjs
  // 收录门槛），保持基础渲染形态（slot 文本叶子件补默认内容，其余裸挂载）。
  const allNames = [primary, ...secondary];
  const siblingNote =
    secondary.length > 0 ? ` 同族导出一并真渲染：${secondary.join("、")}。` : "";
  const stateNote =
    states.length > 0 ? ` 交互态矩阵（S1）：${states.map((state) => state.name).join("、")}。` : "";
  const template = `<div class="studio-demo">${allNames.map(templateElement).join("")}</div>`;
  const body = [
    ...header,
    importStatement,
    ``,
    `const meta = {`,
    `  title: 'AntDV 组件/${primary}',`,
    `  component: ${primary},`,
    `  parameters: {`,
    `    docs: { description: { component: 'ant-design-vue 4.2.6 基础渲染（画廊生成器产出）。${siblingNote}${stateNote}${sceneNote}' } },`,
    `  },`,
    `} satisfies Meta<typeof ${primary}>;`,
    `export default meta;`,
    ``,
    `export const Default: StoryObj = {`,
    ...renderBody(allNames, template, undefined),
    `};`,
  ];
  for (const state of states) {
    body.push(
      ``,
      `export const ${state.name}: StoryObj = {`,
      ...renderBody(
        importNames,
        `<div class="studio-demo">${state.template}</div>`,
        state.setupData ?? entry.setupData,
      ),
      `};`,
    );
  }
  body.push(``, ``);
  return body.join("\n");
}

/** 生成全部组件族 story（返回 { count, files, families, storyCount }；outDir 幂等清场重建）。 */
export function generateComponentStories(outDir, componentsJsPath = ANTDV_COMPONENTS_JS) {
  if (!outDir) throw new Error("generateComponentStories 需要显式 outDir（generate-all 注入）");
  const families = parseAntdvComponentFamilies(readFileSync(componentsJsPath, "utf8"));
  const reverseMap = deriveReverseMap(
    readArchetypeComponentMap(),
    families.map((family) => family.primary),
  );
  resetDir(outDir);
  const files = [];
  for (const family of families) {
    const target = join(outDir, `${family.primary}.stories.ts`);
    writeFileEnsuringDir(target, renderComponentStory(family, reverseMap));
    files.push(target);
  }
  return {
    count: files.length,
    files,
    families,
    storyCount: countAllStories(families),
  };
}
