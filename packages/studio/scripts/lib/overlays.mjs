// Overlay 能力清单 MDX 生成器（G-A · 四类页面之三：18 族 stack overlay 能力页）。
//
// 内容源（只读）：packages/cli/seeds/specs/hard/stacks/<slug>/（index.md +
// <slug>-overlay.md；18 族 frontmatter 键形 2026-09-06 实证统一：capability/
// requires/conflicts/coexistence/lane/status/authority_scope/seed_version 等）。
// 页面透传：身份 frontmatter 键值表 + Scope/Rules/Checklist 正文（code-span 感知
// MDX 转义——overlay 正文含 `<style scoped>` 等官方词形）+ x-research-anchors 源指向。
import { readdirSync, statSync } from "node:fs";
import yaml from "js-yaml";
import { join } from "node:path";
import {
  SEEDS_STACKS_DIR,
  escapeMDXText,
  keyValueTable,
  nonAuthoritativeHeader,
  readFileUtf8,
  resetDir,
  tableRow,
  toPlainText,
  writeFileEnsuringDir,
} from "./common.mjs";

/** 解析 frontmatter（首对 --- 之间）+ 正文。 */
function splitFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) return { frontmatter: {}, body: markdown };
  const end = markdown.indexOf("\n---", 4);
  if (end < 0) return { frontmatter: {}, body: markdown };
  const raw = markdown.slice(4, end);
  const body = markdown.slice(markdown.indexOf("\n", end + 1) + 1);
  return { frontmatter: yaml.load(raw) ?? {}, body };
}

/** 取一节正文（## X 到下一 ## 之间），逐行 MDX 转义透传。 */
function renderSection(body, heading) {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) break;
    out.push(lines[i]);
  }
  // 去首尾空行 → 转义（每行独立；列表缩进/粗体等 Markdown 结构原样保留）。
  while (out.length > 0 && out[0].trim() === "") out.shift();
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return out.map((line) => escapeMDXText(line));
}

/** 单族 overlay → MDX 页文本。 */
export function renderOverlayPage(slug, indexMarkdown, overlayMarkdown) {
  const indexMeta = splitFrontmatter(indexMarkdown).frontmatter;
  const { frontmatter, body } = splitFrontmatter(overlayMarkdown);
  const pick = (key) => frontmatter[key] ?? indexMeta[key];
  const lines = [];

  lines.push(`import { Meta } from '@storybook/addon-docs/blocks';`);
  lines.push("");
  lines.push(`<Meta title="Overlay 能力清单/${escapeMDXText(slug)}" />`);
  lines.push("");
  lines.push(`# Overlay 能力清单：${escapeMDXText(String(slug))}`);
  lines.push("");
  lines.push(
    nonAuthoritativeHeader(`packages/cli/seeds/specs/hard/stacks/${slug}/（index.md + overlay）`),
  );

  lines.push("## 身份与能力");
  lines.push("");
  lines.push(
    keyValueTable([
      ["slug", slug],
      ["legacy_id", pick("legacy_id")],
      ["lane", pick("lane")],
      ["status", pick("status")],
      ["authority_scope", pick("authority_scope")],
      ["seed_version", pick("seed_version")],
      ["capability", pick("capability")],
      ["requires", pick("requires") ?? []],
      ["conflicts", pick("conflicts") ?? []],
      ["coexistence", pick("coexistence")],
      ["stages", pick("stages") ?? []],
    ]),
  );
  lines.push("");

  const scope = renderSection(body, "Scope");
  if (scope.length > 0) {
    lines.push("## Scope（透传）");
    lines.push("");
    lines.push(scope.join("\n"));
    lines.push("");
  }

  const rules = renderSection(body, "Rules");
  if (rules.length > 0) {
    lines.push("## Rules 要点（透传）");
    lines.push("");
    lines.push(rules.join("\n"));
    lines.push("");
  }

  const checklist = renderSection(body, "Checklist");
  if (checklist.length > 0) {
    lines.push("## Checklist 要点（透传）");
    lines.push("");
    lines.push(checklist.join("\n"));
    lines.push("");
  }

  const anchors = frontmatter["x-research-anchors"] ?? {};
  const sources = Array.isArray(anchors?.sources) ? anchors.sources : [];
  lines.push("## 源指向（x-research-anchors）");
  lines.push("");
  if (anchors.note) {
    lines.push(escapeMDXText(anchors.note));
    lines.push("");
  }
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

/** 生成全部 overlay 页（返回 { count, files, slugs }；outDir 幂等清场重建）。 */
export function generateOverlayPages(outDir, stacksDir = SEEDS_STACKS_DIR) {
  if (!outDir) throw new Error("generateOverlayPages 需要显式 outDir（generate-all 注入）");
  const slugs = readdirSync(stacksDir)
    .filter((name) => statSync(join(stacksDir, name)).isDirectory())
    .sort();
  resetDir(outDir);
  const files = [];
  for (const slug of slugs) {
    const slugDir = join(stacksDir, slug);
    const entries = readdirSync(slugDir).sort();
    const indexFile = entries.find((name) => name === "index.md");
    const overlayFile = entries.find((name) => name.endsWith("-overlay.md"));
    if (!overlayFile) throw new Error(`stack 族 ${slug} 缺 overlay md`);
    const overlayMarkdown = readFileUtf8(join(slugDir, overlayFile));
    const indexMarkdown = indexFile ? readFileUtf8(join(slugDir, indexFile)) : "";
    const target = join(outDir, `${slug}.mdx`);
    writeFileEnsuringDir(target, renderOverlayPage(slug, indexMarkdown, overlayMarkdown));
    files.push(target);
  }
  return { count: files.length, files, slugs };
}
