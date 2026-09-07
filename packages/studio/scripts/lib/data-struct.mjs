// Database Struct 占位分区生成器（S5 · Owner 裁定 09-06 追加：画廊缺「数据结构」
// 分区——起步没有也得占位）。
//
// 内容源（只读，零新增规范物料）：
// 1. packages/cli/seeds/specs/hard/themes/data-and-transactions.md（B7-THEME 聚合
//    主题文档）——「该写什么」指引逐行透传其 §MUST 与 §Checklist 节（含逐源归属行，
//    零改写零删减）；
// 2. packages/cli/seeds/baseline/data/（data lane 播种件）——文件导航 + 首行标题
//    （播种件是「Owner 就地填写」面：起步值一律 UNKNOWN，画廊不承载填写面）。
//
// 占位声明（G-D 边界）：业务实体/表结构不预置——项目数据结构定义后由 Owner 填充
// baseline data 面；业务实体对象一律走 New Entity Gate 治理通路创建。
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  SEEDS_BASELINE_DIR,
  escapeMDXText,
  nonAuthoritativeHeader,
  readFileUtf8,
  resetDir,
  tableRow,
  writeFileEnsuringDir,
} from "./common.mjs";

/** 主题文档路径（B7-THEME 聚合件；与注入面同步源一致）。 */
const DATA_TRANSACTIONS_THEME = join(
  SEEDS_BASELINE_DIR,
  "..",
  "specs",
  "hard",
  "themes",
  "data-and-transactions.md",
);

/** 取一节正文（## X 到下一 ## 之间），逐行 MDX 转义透传（零改写零删减）。 */
function renderThemeSection(body, heading) {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) throw new Error(`data-and-transactions.md 缺 ${heading} 节（聚合件形态漂移？）`);
  const out = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) break;
    out.push(lines[i]);
  }
  while (out.length > 0 && out[0].trim() === "") out.shift();
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  if (out.length === 0) throw new Error(`data-and-transactions.md ${heading} 节为空`);
  return out.map((line) => escapeMDXText(line));
}

/** 每文件首行 `# ` 标题（缺省回落文件名；与 baseline.mjs 同一语义）。 */
function firstHeading(filePath, fileName) {
  const markdown = readFileUtf8(filePath);
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? match[1].trim() : fileName;
}

/** 渲染 Database Struct 占位分区页。 */
export function renderDataStructPage(themeMarkdown, dataFiles, dataDir) {
  const lines = [];

  lines.push(`import { Meta } from '@storybook/addon-docs/blocks';`);
  lines.push("");
  lines.push(`<Meta title="Database Struct/占位（待项目数据结构定义）" />`);
  lines.push("");
  lines.push("# Database Struct（占位分区）");
  lines.push("");
  lines.push(
    nonAuthoritativeHeader(
      "packages/cli/seeds/specs/hard/themes/data-and-transactions.md + packages/cli/seeds/baseline/data/",
    ),
  );

  lines.push("## 占位声明（为什么这一区是空的）");
  lines.push("");
  lines.push(
    "**画廊起步没有业务数据结构——这一区是刻意的占位，不是缺失**：业务实体/表结构" +
      "属于项目数据面，不预置（G-D 业务零出现）。填充时机与通路：",
  );
  lines.push("");
  lines.push(
    "1. **随项目数据结构定义后填充**——项目内由 Owner 就地填写 baseline data 面" +
      "（`baseline/data/` 播种件，起步值一律 UNKNOWN，不猜测、不留空白或占位描述词形）；",
  );
  lines.push(
    "2. **业务实体走 New Entity Gate**——治理面新建业务对象必过 New Entity Gate" +
      "（`pomaster new-entity` / `pomaster check --gates NEW_ENTITY`），画廊不代行该通路；",
  );
  lines.push(
    "3. **画廊只呈现「该写什么」**——下方规范指引与基线导航由生成器从锚定物料只读渲染，" +
      "零新增规范语义。",
  );
  lines.push("");

  lines.push("## 该写什么（规范指引 · 主题文档 MUST 透传）");
  lines.push("");
  lines.push(
    "源：`packages/cli/seeds/specs/hard/themes/data-and-transactions.md`（B7-THEME，" +
      "data-and-transactions 主题聚合件）`## MUST` 节逐行透传——每条前的粗体行是来源协议归属：",
  );
  lines.push("");
  lines.push(renderThemeSection(themeMarkdown, "MUST").join("\n"));
  lines.push("");

  lines.push("## 自检清单（Checklist 透传）");
  lines.push("");
  lines.push("同源 `## Checklist` 节逐行透传——数据面产出的收口自检位：");
  lines.push("");
  lines.push(renderThemeSection(themeMarkdown, "Checklist").join("\n"));
  lines.push("");

  lines.push("## baseline data 面（项目内填充位导航）");
  lines.push("");
  lines.push(
    "`packages/cli/seeds/baseline/data/` 播种件导航——init 播种进项目 `baseline/data/`，" +
      "由 Owner 就地填写；此处仅列文件与职责标题，不透传填写面正文（播种件起步一律 UNKNOWN）：",
  );
  lines.push("");
  lines.push(tableRow(["播种文件", "首行标题"]));
  lines.push(tableRow(["---", "---"]));
  for (const file of dataFiles) {
    lines.push(
      tableRow([
        `\`${escapeMDXText(file.name)}\``,
        escapeMDXText(firstHeading(join(dataDir, file.name), file.name)),
      ]),
    );
  }
  lines.push("");
  return lines.join("\n");
}

/** 生成 Database Struct 占位页（返回 { count: 1, file }；outDir 幂等清场重建）。 */
export function generateDataStructPage(
  outDir,
  baselineDataDir = join(SEEDS_BASELINE_DIR, "data"),
  themePath = DATA_TRANSACTIONS_THEME,
) {
  if (!outDir) throw new Error("generateDataStructPage 需要显式 outDir（generate-all 注入）");
  if (!statSync(baselineDataDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`baseline data lane 目录缺失: ${baselineDataDir}`);
  }
  const dataFiles = readdirSync(baselineDataDir)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .sort()
    .map((name) => ({ name }));
  if (dataFiles.length === 0) {
    throw new Error("baseline data lane 无播种文件——目录宪法 B6D 分母漂移？");
  }
  const themeMarkdown = readFileUtf8(themePath);
  resetDir(outDir);
  const target = join(outDir, "database-struct.mdx");
  writeFileEnsuringDir(target, renderDataStructPage(themeMarkdown, dataFiles, baselineDataDir));
  return { count: 1, file: target, dataFiles };
}
