// Design tokens 展示页 story 生成器（F-M2 · Vue 主实例）。
//
// 数据源（单一事实源）：packages/cli/seeds/baseline/frontend/design-tokens.yaml——
// 经 scripts/lib/design-tokens.mjs 构建期装载，页面数值零手抄（改 seed 即改页）。
// 九组分区渲染（PRD R1）：color 色板（值块+hex 标注）/ typography 字族·字号·字重·
// 行高样张 / spacing 标尺 / radius 圆角样张 / elevation 阴影样张；
// density/layout/motion/breakpoints 表格化。UNKNOWN 键渲染诚实占位样式（虚线框 +
// UNKNOWN 词形），禁伪造演示值（宁缺毋假——回填决策留 Owner）。
//
// 呈现纪律：
// - token 值只经 displayValue（String(value)）装载呈现；页框 chrome 用色
//   （#eeeeee/#bfbfbf/#8c8c8c/#fdfdfd/#fffbe6/#d48806/#555555）一律不取 seed token 值。
// - NON-AUTHORITATIVE 标注 + 权威源指向（geist-foundations.mdx 先例同形）+
//   origin=preset advisory 语义透传（R3）。
// - 生成器 fail-closed：hint 词形闭包校验（渲染分支与 hint 词表同步，缺分支即
//   生成失败，不带病产出）。
import { join } from "node:path";
import { DESIGN_TOKENS_PATH, loadDesignTokens } from "./design-tokens.mjs";
import { resetDir, writeFileEnsuringDir } from "./common.mjs";

/** 渲染分支覆盖的 hint 词形闭包（loader 新增 hint 必须先补此处与模板分支）。 */
const KNOWN_HINTS = [
  "swatch",
  "family",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "ruler",
  "radius",
  "shadow",
  "text",
];

/** 常量嵌入（两空格续行缩进——生成文件可读性）。 */
function embedConst(name, value) {
  const json = JSON.stringify(value, null, 2)
    .split("\n")
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join("\n");
  return `const ${name} = ${json};`;
}

/** story docs 描述（计数从装载模型派生——分母零手抄）。 */
function docsDescription(model) {
  return [
    `design tokens 九组语义 token 只读视觉呈现（F-M2）：`,
    `${model.valueCount} 真值 + ${model.unknownCount} UNKNOWN 诚实占位`,
    `（宁缺毋假：无权威出处/映射非唯一的键渲染 UNKNOWN 占位样式，禁伪造演示值）。`,
    `数值全部构建期装载自 ${model.sourcePath}`,
    `（origin=${model.origin}，advisory——Owner 经 baseline confirm 确认前不构成项目事实；`,
    `逐值出处注记与 origin 词形语义见该文件头注；值变更走确认链，画廊零改值）。`,
    `与 React sidecar「Foundations/Design Tokens」同数据源同语义（对照浏览）。`,
  ].join(" ");
}

/** Vue 模板（页框 style 串一律 kebab-case；:style 对象一律 camelCase）。 */
function pageTemplate() {
  return `<div class="studio-demo dt-page" style="display: block; max-width: 1100px;">
  <p style="border: 1px solid #fffbe6; border-left: 4px solid #d48806; background: #fffbe6; padding: 12px 16px; margin: 0 0 8px; font-size: 13px; line-height: 1.8;">
    <strong>NON-AUTHORITATIVE</strong> — 本页为 design tokens 只读视觉呈现，非规范文本。
    权威源：{{ tokenMeta.sourcePath }}（origin={{ tokenMeta.origin }}，advisory——Owner 经
    baseline confirm 确认前不构成项目事实；逐值出处注记与 origin 词形语义见该文件头注；
    值变更走确认链，画廊零改值）。
  </p>
  <p style="margin: 0 0 24px; font-size: 12px; color: #8c8c8c;">
    本页构建期装载 {{ tokenMeta.valueCount }} 个真值 + {{ tokenMeta.unknownCount }} 个 UNKNOWN 诚实占位
    （宁缺毋假：无权威出处/映射非唯一的键渲染 UNKNOWN 占位样式，禁伪造演示值，回填决策留 Owner）。
    单一事实源：全部数值来自 seed 装载——改 seed 即改页。
  </p>
  <section v-for="group in tokenGroups" :key="group.key" style="margin: 0 0 32px;">
    <h3 style="margin: 0 0 4px; font-size: 16px;">{{ group.title }}（{{ group.entries.length }} 键 · {{ group.kind === 'table' ? '表格化' : '样张' }}）</h3>
    <p v-if="group.note" style="margin: 0 0 8px; font-size: 12px; color: #8c8c8c;">{{ group.note }}</p>
    <table v-if="group.kind === 'table'" style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px;">
      <thead>
        <tr>
          <th style="text-align: left; padding: 6px 12px; border-bottom: 2px solid #bfbfbf;">token</th>
          <th style="text-align: left; padding: 6px 12px; border-bottom: 2px solid #bfbfbf;">值</th>
          <th style="text-align: left; padding: 6px 12px; border-bottom: 2px solid #bfbfbf;">状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in group.entries" :key="entry.path" :data-token="entry.path" :data-unknown="entry.unknown ? 'true' : 'false'">
          <td style="padding: 6px 12px; border-bottom: 1px solid #eeeeee;"><code style="font-size: 12px;">{{ entry.path }}</code></td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #eeeeee;">
            <code v-if="!entry.unknown" style="font-size: 12px; word-break: break-all;">{{ entry.displayValue }}</code>
            <span v-else style="font-size: 11px; color: #8c8c8c; border: 1px dashed #bfbfbf; padding: 0 6px; border-radius: 3px;">UNKNOWN</span>
          </td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #eeeeee;">{{ entry.unknown ? 'UNKNOWN（宁缺毋假——回填决策留 Owner）' : 'origin=' + tokenMeta.origin }}</td>
        </tr>
      </tbody>
    </table>
    <div v-else style="display: flex; flex-wrap: wrap; gap: 12px;">
      <div v-for="entry in group.entries" :key="entry.path" :data-token="entry.path" :data-unknown="entry.unknown ? 'true' : 'false'" style="display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid #eeeeee; border-radius: 6px; width: 232px; box-sizing: border-box;">
        <div style="height: 56px; display: flex; align-items: center; overflow: hidden;">
          <template v-if="!entry.unknown">
            <div v-if="entry.hint === 'swatch'" :style="{ width: '64px', height: '40px', borderRadius: '4px', background: entry.displayValue, border: '1px solid #bfbfbf' }"></div>
            <div v-else-if="entry.hint === 'family'" :style="{ fontFamily: entry.displayValue, fontSize: '15px' }">POMaster 令牌样张 Aa 099</div>
            <div v-else-if="entry.hint === 'fontSize'" :style="{ fontSize: entry.displayValue + 'px', lineHeight: 1.3 }">POMaster 令牌样张 Aa</div>
            <div v-else-if="entry.hint === 'fontWeight'" :style="{ fontWeight: entry.displayValue, fontSize: '15px' }">POMaster 令牌样张 Aa</div>
            <div v-else-if="entry.hint === 'lineHeight'" :style="{ lineHeight: entry.displayValue, width: '200px', fontSize: '13px' }">POMaster 令牌样张：行高以本段换行文本呈现，数值以标注为准。</div>
            <div v-else-if="entry.hint === 'ruler'" :style="{ width: '192px', height: '12px', background: '#eeeeee' }">
              <div :style="{ width: Number(entry.displayValue) * 3 + 'px', height: '12px', background: '#8c8c8c' }"></div>
            </div>
            <div v-else-if="entry.hint === 'radius'" :style="{ width: '64px', height: '40px', border: '2px solid currentColor', borderRadius: entry.displayValue + 'px', display: 'flex', alignItems: 'center', justifyContent: 'center' }">Aa</div>
            <div v-else-if="entry.hint === 'shadow'" :style="{ width: '120px', height: '40px', background: '#fdfdfd', borderRadius: '6px', boxShadow: entry.displayValue, display: 'flex', alignItems: 'center', justifyContent: 'center' }">Aa</div>
            <code v-else style="font-size: 12px; word-break: break-all;">{{ entry.displayValue }}</code>
          </template>
          <div v-else style="width: 64px; height: 40px; border: 2px dashed #bfbfbf; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #8c8c8c; font-size: 11px; letter-spacing: 1px;">UNKNOWN</div>
        </div>
        <code style="font-size: 12px; word-break: break-all;">{{ entry.path }}</code>
        <code v-if="!entry.unknown" style="font-size: 12px; color: #555555; word-break: break-all;">{{ entry.displayValue }}</code>
        <span v-else style="font-size: 11px; color: #8c8c8c; border: 1px dashed #bfbfbf; padding: 0 6px; border-radius: 3px; align-self: flex-start;">UNKNOWN</span>
      </div>
    </div>
  </section>
</div>`;
}

/** 装载模型 → CSF3 story（Vue）文本。 */
export function renderDesignTokensStory(model) {
  return [
    `// GENERATED by packages/studio/scripts/lib/design-tokens-page.mjs —— 禁手改（重跑生成器覆盖）。`,
    `// 源：${model.sourcePath}（构建期装载——单一事实源：改 seed 即改页）。`,
    `// NON-AUTHORITATIVE：画廊只读呈现，非规范文本；origin=${model.origin} 值 advisory`,
    `//（Owner baseline confirm 确认前不构成项目事实——确认链通道不变）。`,
    `// 页框 chrome 用色（#eeeeee/#bfbfbf/#8c8c8c/#fdfdfd/#fffbe6/#d48806/#555555）不取 seed token`,
    `// 值——token 值只经 displayValue 装载呈现（单一事实源红线）。`,
    `import type { Meta, StoryObj } from '@storybook/vue3';`,
    ``,
    embedConst("TOKEN_META", {
      origin: model.origin,
      customized: model.customized,
      sourcePath: model.sourcePath,
      valueCount: model.valueCount,
      unknownCount: model.unknownCount,
    }),
    embedConst("TOKEN_GROUPS", model.groups),
    ``,
    `const meta = {`,
    `  title: 'Foundations/Design Tokens（seed 只读渲染）',`,
    `  parameters: {`,
    `    docs: { description: { component: ${JSON.stringify(docsDescription(model))} } },`,
    `  },`,
    `};`,
    `export default meta;`,
    ``,
    `export const Default: StoryObj = {`,
    `  render: () => ({`,
    `    setup() {`,
    `      return { tokenGroups: TOKEN_GROUPS, tokenMeta: TOKEN_META };`,
    `    },`,
    `    template: ${JSON.stringify(pageTemplate())},`,
    `  }),`,
    `};`,
    ``,
  ].join("\n");
}

/** 生成 design tokens 展示页 story（返回 { count, file, valueCount, unknownCount, groups }）。 */
export function generateDesignTokensPage(outDir, tokensPath = DESIGN_TOKENS_PATH) {
  if (!outDir) throw new Error("generateDesignTokensPage 需要显式 outDir（generate-all 注入）");
  const model = loadDesignTokens(tokensPath);
  const knownHintSet = new Set(KNOWN_HINTS);
  for (const group of model.groups) {
    for (const entry of group.entries) {
      if (!knownHintSet.has(entry.hint)) {
        throw new Error(
          `token ${entry.path} 的呈现 hint "${entry.hint}" 无渲染分支（词形闭包——先补 KNOWN_HINTS 与模板分支再改 loader）`,
        );
      }
    }
  }
  resetDir(outDir);
  const target = join(outDir, "design-tokens.stories.ts");
  writeFileEnsuringDir(target, renderDesignTokensStory(model));
  return {
    count: 1,
    file: target,
    valueCount: model.valueCount,
    unknownCount: model.unknownCount,
    groups: model.groups.map((group) => group.key),
  };
}
