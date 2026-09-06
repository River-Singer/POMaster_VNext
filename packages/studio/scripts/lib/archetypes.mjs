// Archetype 语义卡 MDX 生成器（G-A · 四类页面之一：41 张 archetype 语义画廊页）。
//
// 内容源（只读）：catalog/archetypes/*.json（41 张，全部含 id/kind/layer/title_zh/
// summary_zh/semantic{responsibility,when_to_use,when_not_to_use}/
// composition{requires,optional,incompatible}/x-research-anchors——2026-09-06 字段
// 覆盖实证 41/41）。defaults 仅 18/41 在座 → 条件渲染；其余长尾字段全量进
// "其余字段" JSON 围栏（信息零丢弃）。
//
// 形态裁定：MDX 实现是 React-only（官方原文，研究 §2）——archetype 是语义构件非
// 可渲染组件，页面走 documentation-only（unattached）纯 MDX 形态，不强行塞 Vue
// 组件、不写演示实现。
import { join } from "node:path";
import {
  CATALOG_ARCHETYPES_DIR,
  escapeMDXText,
  jsonCodeBlock,
  keyValueTable,
  listFilesSorted,
  nonAuthoritativeHeader,
  readFileUtf8,
  resetDir,
  tableRow,
  toPlainText,
  writeFileEnsuringDir,
} from "./common.mjs";

/** 已单独成节的字段（进"其余字段"围栏前剥除，避免重复呈现）。 */
const RENDERED_STANDALONE_FIELDS = new Set([
  "id",
  "kind",
  "layer",
  "title_zh",
  "summary_zh",
  "semantic",
  "composition",
  "defaults",
  "x-research-anchors",
]);

/** 读全部 archetype（文件名序）。 */
export function collectArchetypes(dir = CATALOG_ARCHETYPES_DIR) {
  return listFilesSorted(dir, ".json").map((fileName) => ({
    fileName,
    archetype: JSON.parse(readFileUtf8(join(dir, fileName))),
  }));
}

/** 单张 archetype → MDX 文档页文本。 */
export function renderArchetypePage(fileName, archetype) {
  // 侧边栏分组：文件名 archetype.<group>.<name>.json 的第二段（component/backend/
  // data/state/frontend/page/runtime/api）。
  const parts = fileName.replace(/\.json$/, "").split(".");
  const group = parts[1] ?? "misc";
  const title = archetype.title_zh ?? fileName;
  const lines = [];

  lines.push(`import { Meta } from '@storybook/addon-docs/blocks';`);
  lines.push("");
  lines.push(`<Meta title="Archetype 语义卡/${group}/${escapeMDXText(title)}" />`);
  lines.push("");
  lines.push(`# Archetype 语义卡：${escapeMDXText(title)}`);
  lines.push("");
  lines.push(nonAuthoritativeHeader(`catalog/archetypes/${fileName}`));
  lines.push("## 身份");
  lines.push("");
  lines.push(
    keyValueTable([
      ["id", archetype.id],
      ["kind", archetype.kind],
      ["layer", archetype.layer],
      ["title_zh", archetype.title_zh],
    ]),
  );
  lines.push("");
  lines.push(escapeMDXText(archetype.summary_zh ?? ""));
  lines.push("");

  const semantic = archetype.semantic ?? {};
  lines.push("## 语义（semantic）");
  lines.push("");
  lines.push(
    keyValueTable([
      ["responsibility（职责）", semantic.responsibility],
      ["when_to_use（何时用）", semantic.when_to_use],
      ["when_not_to_use（何时不用）", semantic.when_not_to_use],
    ]),
  );
  lines.push("");

  const composition = archetype.composition ?? {};
  lines.push("## 组合（composition）");
  lines.push("");
  lines.push(
    keyValueTable([
      ["requires（必需组合）", composition.requires ?? []],
      ["optional（可选组合）", composition.optional ?? []],
      ["incompatible（不兼容）", composition.incompatible ?? []],
    ]),
  );
  lines.push("");

  if (archetype.defaults !== undefined) {
    lines.push("## Defaults");
    lines.push("");
    lines.push(jsonCodeBlock(archetype.defaults));
    lines.push("");
  }

  const rest = {};
  for (const key of Object.keys(archetype).sort()) {
    if (!RENDERED_STANDALONE_FIELDS.has(key)) rest[key] = archetype[key];
  }
  if (Object.keys(rest).length > 0) {
    lines.push("## 其余字段（全量透传）");
    lines.push("");
    lines.push(jsonCodeBlock(rest));
    lines.push("");
  }

  lines.push("## 研究锚（x-research-anchors）");
  lines.push("");
  const anchors = archetype["x-research-anchors"] ?? {};
  if (anchors.note) {
    lines.push(escapeMDXText(anchors.note));
    lines.push("");
  }
  const sources = Array.isArray(anchors.sources) ? anchors.sources : [];
  if (sources.length > 0) {
    lines.push(tableRow(["来源", "实抓日期"]));
    lines.push(tableRow(["---", "---"]));
    for (const source of sources) {
      lines.push(
        tableRow([
          escapeMDXText(toPlainText(source.url ?? "—")),
          escapeMDXText(toPlainText(source.fetched ?? "—")),
        ]),
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** 生成全部 archetype 页（返回 { count, files }；outDir 由调用方显式注入，幂等清场重建）。 */
export function generateArchetypePages(outDir) {
  if (!outDir) throw new Error("generateArchetypePages 需要显式 outDir（generate-all 注入）");
  const entries = collectArchetypes();
  resetDir(outDir);
  const files = [];
  for (const { fileName, archetype } of entries) {
    const target = join(outDir, `${fileName.replace(/\.json$/, "")}.mdx`);
    writeFileEnsuringDir(target, renderArchetypePage(fileName, archetype));
    files.push(target);
  }
  return { count: files.length, files };
}
