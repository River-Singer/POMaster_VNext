// Baseline 四 lane 导航页生成器（G-A · 四类页面之四：foundations 与边界页的
// baseline 面）。
//
// 内容源（只读）：packages/cli/seeds/baseline/{frontend,backend,data,platform}/
// （frontend 7 / backend 8 / data 5 / platform 4）+ manifest.yaml（B6D 播种身份）。
// 生成形态：单页 lane 导航（文件清单 + 首行标题），不含正文透传（baseline 播种件
// 是「Owner 就地填写」面——画廊只做导航呈现，替 Owner 填表属 G-D 业务预置违例）。
import { readdirSync, statSync } from "node:fs";
import yaml from "js-yaml";
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

/** 四 lane（manifest.yaml lanes 键序 = frontend/backend/data/platform）。 */
function readLanes(baselineDir) {
  const manifest = yaml.load(readFileUtf8(join(baselineDir, "manifest.yaml"))) ?? {};
  const lanes = manifest?.lanes ?? {};
  const names = Object.keys(lanes).sort();
  if (names.length === 0) throw new Error("baseline manifest.yaml 缺 lanes 台账");
  return names;
}

/** 每文件首行 `# ` 标题（缺省回落文件名）。 */
function firstHeading(filePath, fileName) {
  const markdown = readFileUtf8(filePath);
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? match[1].trim() : fileName;
}

/** 渲染导航页。 */
export function renderBaselinePage(laneSummaries, manifest) {
  const lines = [];
  lines.push(`import { Meta } from '@storybook/addon-docs/blocks';`);
  lines.push("");
  lines.push(`<Meta title="Baseline/四 lane 总览" />`);
  lines.push("");
  lines.push("# Baseline 四 lane 总览");
  lines.push("");
  lines.push(
    nonAuthoritativeHeader("packages/cli/seeds/baseline/（manifest.yaml + 四 lane 播种件）"),
  );
  lines.push(
    "本页是 init 播种的 Project Engineering Baseline（`baseline/`）导航：四 lane、" +
      "播种件清单与各自职责标题。播种件起步一律 UNKNOWN——填写动作发生在项目内" +
      "（`baseline confirm` 烙印走 digest 快照），画廊不承载填写面、不预置任何业务内容（G-D）。",
  );
  lines.push("");
  lines.push("## 身份");
  lines.push("");
  lines.push(tableRow(["键", "值"]));
  lines.push(tableRow(["---", "---"]));
  lines.push(tableRow(["id", escapeMDXText(String(manifest?.id ?? "—"))]));
  lines.push(tableRow(["schema_version", escapeMDXText(String(manifest?.schema_version ?? "—"))]));
  lines.push(tableRow(["seed_version", escapeMDXText(String(manifest?.seed?.seed_version ?? "—"))]));
  lines.push(tableRow(["status", escapeMDXText(String(manifest?.status ?? "—"))]));
  lines.push(tableRow(["lanes", escapeMDXText(laneSummaries.map((lane) => lane.lane).join(" / "))]));
  lines.push("");
  for (const lane of laneSummaries) {
    lines.push(`## lane：${escapeMDXText(lane.lane)}（${lane.files.length} 件）`);
    lines.push("");
    lines.push(tableRow(["文件", "首行标题"]));
    lines.push(tableRow(["---", "---"]));
    for (const file of lane.files) {
      lines.push(
        tableRow([
          `\`${escapeMDXText(file.name)}\``,
          escapeMDXText(firstHeading(file.path, file.name)),
        ]),
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** 生成 baseline 导航页（返回 { count: 1, file }；outDir 幂等清场重建）。 */
export function generateBaselinePage(outDir, baselineDir = SEEDS_BASELINE_DIR) {
  if (!outDir) throw new Error("generateBaselinePage 需要显式 outDir（generate-all 注入）");
  const manifest = yaml.load(readFileUtf8(join(baselineDir, "manifest.yaml"))) ?? {};
  const laneSummaries = readLanes(baselineDir).map((lane) => {
    const laneDir = join(baselineDir, lane);
    if (!statSync(laneDir, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`baseline lane 目录缺失: ${lane}`);
    }
    const files = readdirSync(laneDir)
      .filter((name) => name !== "README.md")
      .sort()
      .map((name) => ({ name, path: join(laneDir, name) }));
    return { lane, files };
  });
  resetDir(outDir);
  const target = join(outDir, "lanes.mdx");
  const content = renderBaselinePage(laneSummaries, manifest);
  writeFileEnsuringDir(target, content);
  return { count: 1, file: target, lanes: laneSummaries.map((lane) => lane.lane) };
}
