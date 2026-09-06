// 画廊生成器公共库（Step 2 · 裁定 G-A canonical Storybook 实例）。
//
// 职责：路径解析、MDX 转义（MDX 实现是 React-only 且把 `{`/`<` 当 JSX/表达式起界——
// 见 .trellis/tasks/09-06-gallery-and-baseline-presets/research/storybook-integration-facts.md
// §2 Caveat 4；正文值转经 escapeMDXText，行内代码 span 内不转义）、
// NON-AUTHORITATIVE 页头声明、目录/基准路径。
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 本模块目录 URL（变量承接 base——绕开 vite 对 `new URL("字面量", import.meta.url)`
// 的 asset-import-meta-url 转换：该转换在 vitest happy-dom 环境下会把 URL 基准换成
// location 源，fileURLToPath 随即抛 "The URL must be of scheme file"。变量形态不触发
// 转换，node/浏览器/任意测试环境下行为一致）。
const LIB_DIR_URL = import.meta.url;
/** 仓库根（packages/studio/scripts/lib/ → 上溯三级）。 */
export const REPO_ROOT = fileURLToPath(new URL("../../../../", LIB_DIR_URL));
/** archetype catalog 目录（只读——D6：画廊零新增 catalog 物料）。 */
export const CATALOG_ARCHETYPES_DIR = join(REPO_ROOT, "catalog", "archetypes");
/** seeds stacks 目录（只读）。 */
export const SEEDS_STACKS_DIR = join(
  REPO_ROOT,
  "packages",
  "cli",
  "seeds",
  "specs",
  "hard",
  "stacks",
);
/** seeds baseline 目录（只读）。 */
export const SEEDS_BASELINE_DIR = join(REPO_ROOT, "packages", "cli", "seeds", "baseline");
/** studio 包根。 */
export const STUDIO_ROOT = join(REPO_ROOT, "packages", "studio");
/** 生成产物根（gitignore——入库的是生成器，不是产物）。 */
export const GENERATED_DIR = join(STUDIO_ROOT, "generated");
/** antdv 深路径导出清单文件（pnpm 符号链接经 studio 包 node_modules 解析）。 */
export const ANTDV_COMPONENTS_JS = join(
  STUDIO_ROOT,
  "node_modules",
  "ant-design-vue",
  "es",
  "components.js",
);

/** NON-AUTHORITATIVE 页头（所有画廊页统一首节；宪法纪律：示例非权威）。 */
export function nonAuthoritativeHeader(sourcePointer) {
  return [
    "> **NON-AUTHORITATIVE** — 本页为组件可视化画廊（Storybook）呈现，非规范文本；",
    "> 权威语义以锚定源为准。本页内容全部由生成器从既有锚定物料只读渲染——",
    "> 画廊不新增 catalog 物料（D6）、不预置任何业务实体/业务组件（G-D）。",
    `>`,
    `> 权威源：\`${sourcePointer}\``,
    "",
  ].join("\n");
}

/**
 * MDX 文本转义（自由文本值 → MDX 正文安全）。
 *
 * 规则：
 * - 行内代码 span（`...`）内一律不动——CommonMark 代码 span 内反斜杠转义不生效，
 *   补转义会以字面反斜杠漏出到渲染结果；
 * - span 外：`<` → `\<`（MDX 把 `<word` 当 JSX 起界）、`{` → `\{`（MDX 表达式起界）、
 *   `|` → `\|`（GFM 表格列界）。以上字符均为 CommonMark ASCII punctuation，
 *   反斜杠转义合法。
 */
export function escapeMDXText(text) {
  const segments = String(text).split(/(`[^`]*`)/);
  return segments
    .map((segment) => {
      if (segment.startsWith("`") && segment.endsWith("`") && segment.length >= 2) return segment;
      return segment.replace(/</g, "\\<").replace(/\{/g, "\\{").replace(/\|/g, "\\|");
    })
    .join("");
}

/** 锚定值 → 确定性纯文本（js-yaml 把 `fetched: 2026-09-05` 解析成 Date——归一 ISO 日期，
 * 防 timezone/ locale 漂移破坏幂等与可读性）。 */
export function toPlainText(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/** 任意值为 MDX 安全字符串（字符串转义；数组/对象走 JSON 代码围栏由调用方处理）。 */
export function escapeMDXValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return escapeMDXText(value) || "—";
  if (value instanceof Date) return escapeMDXText(toPlainText(value));
  if (Array.isArray(value)) {
    return value.length === 0 ? "—" : value.map((item) => escapeMDXValue(item)).join("、");
  }
  return escapeMDXText(JSON.stringify(value));
}

/** Markdown 表格行。 */
export function tableRow(cells) {
  return `| ${cells.map((cell) => String(cell).replace(/\n/g, " ")).join(" | ")} |`;
}

/** 二列表格（键/值），值经 escapeMDXValue。 */
export function keyValueTable(rows) {
  const lines = [tableRow(["键", "值"]), tableRow(["---", "---"])];
  for (const [key, value] of rows) lines.push(tableRow([escapeMDXText(key), escapeMDXValue(value)]));
  return lines.join("\n");
}

/** JSON → 围栏代码块（fenced code 内 MDX 不做 JSX/表达式解析，无需转义）。 */
export function jsonCodeBlock(value) {
  return "```json\n" + JSON.stringify(value, null, 2) + "\n```";
}

/** 幂等清场重建：删除再建（生成器确定性输出 → 重跑字节相同）。 */
export function resetDir(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

/** 目录下按扩展名过滤的文件名列表（排序 → 生成顺序确定）。 */
export function listFilesSorted(dir, extension) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(extension))
    .sort();
}

/** 写文件（确保父目录在座）。 */
export function writeFileEnsuringDir(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

/** 读文件（utf8）。 */
export function readFileUtf8(filePath) {
  return readFileSync(filePath, "utf8");
}
