// Design tokens 展示页 story 生成器（F-M2 R2 · React sidecar 对照页）。
//
// 与 Vue 主实例（packages/studio/scripts/lib/design-tokens-page.mjs）同数据源同语义：
// 共用 studio 的 design-tokens.mjs 装载器（单一事实源，跨包只读 import——S2 先例
// 同构），等价渲染九组分区（color 色板 / typography 样张 / spacing 标尺 / radius /
// elevation 样张；density/layout/motion/breakpoints 表格化）+ UNKNOWN 诚实占位
// （禁伪造演示值）。呈现形态为裸 JSX + 内联样式（token 值本身就是被呈现对象——
// 不经 antd 组件转手，保「值即所见」对照语义）。
//
// 纪律与 Vue 侧逐条同源：NON-AUTHORITATIVE 标注 + 权威源指向 + origin=preset
// advisory 透传（R3）；页框 chrome 用色（#eeeeee/#bfbfbf/#8c8c8c/#fdfdfd/#fffbe6/
// #d48806/#555555）不取 seed token 值；hint 词形闭包 fail-closed。
//
// C1 组筛选呈现（W2 首批端到端切片，与 Vue 主实例同批同语义——C2 干净面不注入
// 缺陷）：页内客户端筛选——组筛选 + 「只看 UNKNOWN」开关。可见性语义
// （TASK.SLICE_C1 验收②）：真值视图（选组 + 开关关）可见 = 该组真值叶（UNKNOWN
// 占位不混入真值可见分母）；开关视图可见 = UNKNOWN 占位（可叠加组交集）；
// 默认视图 58 叶齐。纯渲染层：seed 与共用装载器零触碰。
import { join } from "node:path";
import { DESIGN_TOKENS_PATH, loadDesignTokens } from "../../../studio/scripts/lib/design-tokens.mjs";
import { resetDir, writeFileEnsuringDir } from "../../../studio/scripts/lib/common.mjs";

/** 渲染分支覆盖的 hint 词形闭包（与 Vue 侧 KNOWN_HINTS 同表——漂移即生成失败）。 */
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

/** story docs 描述（计数从装载模型派生——分母零手抄；与 Vue 侧同词形）。 */
function docsDescription(model) {
  return [
    `design tokens 九组语义 token 只读视觉呈现（F-M2 R2 对照页）：`,
    `${model.valueCount} 真值 + ${model.unknownCount} UNKNOWN 诚实占位`,
    `（宁缺毋假：无权威出处/映射非唯一的键渲染 UNKNOWN 占位样式，禁伪造演示值）。`,
    `数值全部构建期装载自 ${model.sourcePath}`,
    `（origin=${model.origin}，advisory——Owner 经 baseline confirm 确认前不构成项目事实；`,
    `逐值出处注记与 origin 词形语义见该文件头注；值变更走确认链，画廊零改值）。`,
    `页内组筛选与只看 UNKNOWN 开关为纯客户端呈现（UNKNOWN 占位只进开关视图，不混入真值可见分母）。`,
    `与 Vue 主实例「Foundations/Design Tokens」同数据源同语义（对照浏览）。`,
  ].join(" ");
}

/** JSX 视觉渲染体（entry 逐 hint 分支；与 Vue 模板分支一一对应）。 */
function renderVisualJsx() {
  return `const SAMPLE_TEXT = 'POMaster 令牌样张 Aa';

function renderVisual(entry: { hint: string; displayValue: string }) {
  switch (entry.hint) {
    case 'swatch':
      return <div style={{ width: 64, height: 40, borderRadius: 4, background: entry.displayValue, border: '1px solid #bfbfbf' }} />;
    case 'family':
      return <div style={{ fontFamily: entry.displayValue, fontSize: 15 }}>{SAMPLE_TEXT} 099</div>;
    case 'fontSize':
      return <div style={{ fontSize: \`\${entry.displayValue}px\`, lineHeight: 1.3 }}>POMaster 令牌样张 Aa</div>;
    case 'fontWeight':
      return <div style={{ fontWeight: entry.displayValue, fontSize: 15 }}>{SAMPLE_TEXT}</div>;
    case 'lineHeight':
      return <div style={{ lineHeight: entry.displayValue, width: 200, fontSize: 13 }}>POMaster 令牌样张：行高以本段换行文本呈现，数值以标注为准。</div>;
    case 'ruler':
      return (
        <div style={{ width: 192, height: 12, background: '#eeeeee' }}>
          <div style={{ width: Number(entry.displayValue) * 3, height: 12, background: '#8c8c8c' }} />
        </div>
      );
    case 'radius':
      return <div style={{ width: 64, height: 40, border: '2px solid currentColor', borderRadius: \`\${entry.displayValue}px\`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Aa</div>;
    case 'shadow':
      return <div style={{ width: 120, height: 40, background: '#fdfdfd', borderRadius: 6, boxShadow: entry.displayValue, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Aa</div>;
    default:
      return <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{entry.displayValue}</code>;
  }
}

const entryCardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '10px 12px',
  border: '1px solid #eeeeee',
  borderRadius: 6,
  width: 232,
  boxSizing: 'border-box',
};

const unknownBoxStyle: CSSProperties = {
  width: 64,
  height: 40,
  border: '2px dashed #bfbfbf',
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#8c8c8c',
  fontSize: 11,
  letterSpacing: 1,
};

const unknownBadgeStyle: CSSProperties = {
  fontSize: 11,
  color: '#8c8c8c',
  border: '1px dashed #bfbfbf',
  padding: '0 6px',
  borderRadius: 3,
  alignSelf: 'flex-start',
};

const cellStyle: CSSProperties = { padding: '6px 12px', borderBottom: '1px solid #eeeeee' };
const headCellStyle: CSSProperties = { textAlign: 'left', padding: '6px 12px', borderBottom: '2px solid #bfbfbf' };`;
}

/** 单 token 呈现卡（visual 组条目；unknown = 诚实占位盒，禁伪造演示值）。 */
function entryCardJsx() {
  return `function EntryCard({ entry }: { entry: TokenEntry }) {
  return (
    <div className="dt-entry" data-token={entry.path} data-unknown={entry.unknown ? 'true' : 'false'} style={entryCardStyle}>
      <div style={{ height: 56, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        {entry.unknown ? <div style={unknownBoxStyle}>UNKNOWN</div> : renderVisual(entry)}
      </div>
      <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{entry.path}</code>
      {entry.unknown ? (
        <span style={unknownBadgeStyle}>UNKNOWN</span>
      ) : (
        <code style={{ fontSize: 12, color: '#555555', wordBreak: 'break-all' }}>{entry.displayValue}</code>
      )}
    </div>
  );
}`;
}

/** 页面 JSX（九组分区 + NON-AUTHORITATIVE 头注 + 出处提示 + C1 组筛选）。 */
function pageJsx() {
  return `function DesignTokensPage() {
  const [activeGroup, setActiveGroup] = useState('');
  const [unknownOnly, setUnknownOnly] = useState(false);
  const visibleGroups = TOKEN_GROUPS.filter((group) => activeGroup === '' || group.key === activeGroup).map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => {
      if (unknownOnly) return entry.unknown;
      if (activeGroup !== '') return !entry.unknown;
      return true;
    }),
  }));
  return (
    <div className="studio-demo dt-page" style={{ display: 'block', maxWidth: 1100 }}>
      <p style={{ border: '1px solid #fffbe6', borderLeft: '4px solid #d48806', background: '#fffbe6', padding: '12px 16px', margin: '0 0 8px', fontSize: 13, lineHeight: 1.8 }}>
        <strong>NON-AUTHORITATIVE</strong> — 本页为 design tokens 只读视觉呈现，非规范文本。
        权威源：{TOKEN_META.sourcePath}（origin={TOKEN_META.origin}，advisory——Owner 经
        baseline confirm 确认前不构成项目事实；逐值出处注记与 origin 词形语义见该文件头注；
        值变更走确认链，画廊零改值）。
      </p>
      <p style={{ margin: '0 0 24px', fontSize: 12, color: '#8c8c8c' }}>
        本页构建期装载 {TOKEN_META.valueCount} 个真值 + {TOKEN_META.unknownCount} 个 UNKNOWN 诚实占位
        （宁缺毋假：无权威出处/映射非唯一的键渲染 UNKNOWN 占位样式，禁伪造演示值，回填决策留 Owner）。
        单一事实源：全部数值来自 seed 装载——改 seed 即改页。
      </p>
      <div className="dt-filter-bar" data-filter-bar style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, border: '1px solid #eeeeee', borderRadius: 6, padding: '8px 12px', margin: '0 0 24px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          组筛选
          <select data-filter-group value={activeGroup} onChange={(event) => setActiveGroup(event.target.value)} style={{ fontSize: 13, padding: '2px 6px' }}>
            <option value="">全部组</option>
            {TOKEN_GROUPS.map((group) => (
              <option key={group.key} value={group.key}>{group.title}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" data-unknown-view checked={unknownOnly} onChange={(event) => setUnknownOnly(event.target.checked)} />
          只看 UNKNOWN
        </label>
      </div>
      {visibleGroups.map((group) => (
        <section key={group.key} style={{ marginBottom: 32 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>
            {group.title}（{group.entries.length} 键 · {group.kind === 'table' ? '表格化' : '样张'}）
          </h3>
          {group.note ? <p style={{ margin: '0 0 8px', fontSize: 12, color: '#8c8c8c' }}>{group.note}</p> : null}
          {group.kind === 'table' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={headCellStyle}>token</th>
                  <th style={headCellStyle}>值</th>
                  <th style={headCellStyle}>状态</th>
                </tr>
              </thead>
              <tbody>
                {group.entries.map((entry) => (
                  <tr key={entry.path} data-token={entry.path} data-unknown={entry.unknown ? 'true' : 'false'}>
                    <td style={cellStyle}><code style={{ fontSize: 12 }}>{entry.path}</code></td>
                    <td style={cellStyle}>
                      {entry.unknown ? (
                        <span style={unknownBadgeStyle}>UNKNOWN</span>
                      ) : (
                        <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{entry.displayValue}</code>
                      )}
                    </td>
                    <td style={cellStyle}>{entry.unknown ? 'UNKNOWN（宁缺毋假——回填决策留 Owner）' : \`origin=\${TOKEN_META.origin}\`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {group.entries.map((entry) => <EntryCard key={entry.path} entry={entry} />)}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}`;
}

/** 装载模型 → CSF3 story（React/tsx）文本。 */
export function renderReactDesignTokensStory(model) {
  return [
    `// GENERATED by packages/studio-react/scripts/lib/generate-design-tokens-story.mjs —— 禁手改（重跑生成器覆盖）。`,
    `// 源：${model.sourcePath}（构建期装载——单一事实源：改 seed 即改页；装载器与 Vue 主实例共用）。`,
    `// NON-AUTHORITATIVE：画廊对照呈现，非规范文本；origin=${model.origin} 值 advisory`,
    `//（Owner baseline confirm 确认前不构成项目事实——确认链通道不变）。`,
    `// 页框 chrome 用色（#eeeeee/#bfbfbf/#8c8c8c/#fdfdfd/#fffbe6/#d48806/#555555）不取 seed token`,
    `// 值——token 值只经 displayValue 装载呈现（单一事实源红线）。`,
    `// C1 组筛选：页内客户端筛选（纯渲染层）——组筛选 + 只看 UNKNOWN 开关；`,
    `// UNKNOWN 占位叶只进开关视图，不混入真值可见分母（与 Vue 主实例同语义）。`,
    `import { useState } from 'react';`,
    `import type { CSSProperties } from 'react';`,
    `import type { Meta, StoryObj } from '@storybook/react';`,
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
    `interface TokenEntry {`,
    `  path: string;`,
    `  key: string;`,
    `  displayValue: string;`,
    `  unknown: boolean;`,
    `  hint: string;`,
    `}`,
    ``,
    renderVisualJsx(),
    ``,
    entryCardJsx(),
    ``,
    pageJsx(),
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
    `  render: () => <DesignTokensPage />,`,
    `};`,
    ``,
  ].join("\n");
}

/** 常量嵌入（两空格续行缩进——生成文件可读性）。 */
function embedConst(name, value) {
  const json = JSON.stringify(value, null, 2)
    .split("\n")
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join("\n");
  return `const ${name} = ${json};`;
}

/** 生成 React 对照 story（返回 { count, file, valueCount, unknownCount, groups }）。 */
export function generateDesignTokensStory(outDir, tokensPath = DESIGN_TOKENS_PATH) {
  if (!outDir) throw new Error("generateDesignTokensStory 需要显式 outDir（generate-all 注入）");
  const model = loadDesignTokens(tokensPath);
  const knownHintSet = new Set(KNOWN_HINTS);
  for (const group of model.groups) {
    for (const entry of group.entries) {
      if (!knownHintSet.has(entry.hint)) {
        throw new Error(
          `token ${entry.path} 的呈现 hint "${entry.hint}" 无渲染分支（词形闭包——先补 KNOWN_HINTS 与 JSX 分支再改 loader）`,
        );
      }
    }
  }
  resetDir(outDir);
  const target = join(outDir, "DesignTokens.stories.tsx");
  writeFileEnsuringDir(target, renderReactDesignTokensStory(model));
  return {
    count: 1,
    file: target,
    valueCount: model.valueCount,
    unknownCount: model.unknownCount,
    groups: model.groups.map((group) => group.key),
  };
}
