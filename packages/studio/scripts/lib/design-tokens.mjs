// design-tokens.yaml seed 装载器（F-M2 studio tokens 展示页 · 单一事实源）。
//
// 职责：把 packages/cli/seeds/baseline/frontend/design-tokens.yaml（九组语义 token
// 合同 + Default Design preset 值批回填——44 真值 + 14 UNKNOWN）装载为展示页渲染
// 数据。单一事实源红线：页面数值全部来自本装载器构建期装载，禁手抄第二份——
// 改 seed 即改页；本模块只读渲染，值变更走 baseline 确认链（画廊零改值）。
//
// 消费面：packages/studio（Vue 主实例 story 生成器）与 packages/studio-react
// （React sidecar 对照 story 生成器）跨包只读 import（S2 跨包复用先例同构）。
// 叶值三分穷尽（preset 值 | UNKNOWN | 非法形态）：string/number 之外即生成期抛错
// （fail-closed，不带病产出——零第三态纪律与 baseline-seeds.spec 钉测同源）。
import yaml from "js-yaml";
import { join } from "node:path";
import { SEEDS_BASELINE_DIR, readFileUtf8 } from "./common.mjs";

/** design-tokens seed 绝对路径（只读）。 */
export const DESIGN_TOKENS_PATH = join(SEEDS_BASELINE_DIR, "frontend", "design-tokens.yaml");

/** 展示页源指向（权威源注记用——仓库相对词形，单一出处）。 */
export const DESIGN_TOKENS_SOURCE_POINTER = "packages/cli/seeds/baseline/frontend/design-tokens.yaml";

/** UNKNOWN 起步词形（宁缺毋假——无权威出处/映射非唯一的键保持位，禁伪造演示值）。 */
export const UNKNOWN_SENTINEL = "UNKNOWN";

/** 九组语义 token（§16 树键序合同；组缺席/组序漂移即生成期抛错）。 */
export const DESIGN_TOKEN_GROUPS = [
  "color",
  "typography",
  "spacing",
  "radius",
  "elevation",
  "density",
  "layout",
  "motion",
  "breakpoints",
];

/** 组呈现标题（页面 copy，非 token 数据——数值面仍全部来自 seed）。 */
const GROUP_TITLES = {
  color: "color（颜色）",
  typography: "typography（字体排版）",
  spacing: "spacing（间距）",
  radius: "radius（圆角）",
  elevation: "elevation（阴影）",
  density: "density（密度）",
  layout: "layout（布局）",
  motion: "motion（动效）",
  breakpoints: "breakpoints（断点）",
};

/** 组呈现形态：visual = 逐值视觉样张分区；table = 表格化（PRD R1 分区裁定）。 */
const GROUP_KINDS = {
  color: "visual",
  typography: "visual",
  spacing: "visual",
  radius: "visual",
  elevation: "visual",
  density: "table",
  layout: "table",
  motion: "table",
  breakpoints: "table",
};

/** 读 seed 原文（yaml → doc）。 */
export function readDesignTokensDoc(tokensPath = DESIGN_TOKENS_PATH) {
  return yaml.load(readFileUtf8(tokensPath));
}

/** 递归收集叶值（meta 除外；叶 = string|number，object 下钻，其余抛错）。
 *  topGroup = 九组顶层键（叶归属组），prefix = 当前点路径。 */
function collectLeaves(topGroup, prefix, node, out) {
  for (const [key, value] of Object.entries(node)) {
    const path = `${prefix}.${key}`;
    if (value !== null && typeof value === "object") {
      collectLeaves(topGroup, path, value, out);
    } else if (typeof value === "string" || typeof value === "number") {
      out.push({
        group: topGroup,
        key,
        path,
        value,
        unknown: value === UNKNOWN_SENTINEL,
      });
    } else {
      throw new Error(
        `design-tokens 叶 ${path} 值形态非法: ${JSON.stringify(value)}（string|number|UNKNOWN 零第三态——fail-closed）`,
      );
    }
  }
}

/** 单叶的视觉呈现形态（九组分区渲染裁定——swatch/family/fontSize/fontWeight/
 *  lineHeight/ruler/radius/shadow/text；表格化组与无法可视化的形态回落 text——
 *  纯值呈现，绝不伪造可视化样式）。 */
export function renderHintFor(leaf) {
  switch (leaf.group) {
    case "color":
      return "swatch";
    case "typography":
      if (leaf.path.includes(".family.")) return "family";
      if (leaf.path.includes(".size.")) return "fontSize";
      if (leaf.path.includes(".weight.")) return "fontWeight";
      if (leaf.path.includes(".line_height.")) return "lineHeight";
      return "text";
    case "spacing":
      return "ruler";
    case "radius":
      return "radius";
    case "elevation":
      return "shadow";
    default:
      return "text";
  }
}

/** 组备注（页面 copy：呈现口径注记——数值面仍全部来自 seed）。 */
const GROUP_NOTES = {
  spacing: "标尺按 3× 视觉放大呈现（真实数值以标注为准）。",
  typography: "样张文本为呈现载体；字号/字重/行高/字族样式逐值取自 seed。",
};

/**
 * 装载 seed → 展示页渲染模型（单一事实源入口）。
 * 返回 { origin, customized, sourcePath, groups, leaves, valueCount, unknownCount }。
 * groups[].entries[]: { path, key, displayValue, unknown, hint }（value 原始形态
 * 不上页面——displayValue 为 String(value) 唯一呈现词形）。
 */
export function loadDesignTokens(tokensPath = DESIGN_TOKENS_PATH) {
  const doc = readDesignTokensDoc(tokensPath);
  if (doc === null || typeof doc !== "object") {
    throw new Error("design-tokens seed 装载结果非对象——文件形态变化？（fail-closed）");
  }
  const leaves = [];
  for (const group of DESIGN_TOKEN_GROUPS) {
    const subtree = doc[group];
    if (subtree === null || typeof subtree !== "object" || Array.isArray(subtree)) {
      throw new Error(`design-tokens seed 缺组或组形态非法: ${group}（九组合同——缺席即生成失败）`);
    }
    collectLeaves(group, group, subtree, leaves);
  }
  // 未登记组检测（词形闭包——组合同漂移即爆，防 seed 侧私加组被静默丢弃）。
  const knownGroups = new Set([...DESIGN_TOKEN_GROUPS, "meta"]);
  for (const top of Object.keys(doc)) {
    if (!knownGroups.has(top)) {
      throw new Error(`design-tokens seed 出现九组+meta 之外的顶层键: ${top}（词形闭包——先改合同再改页）`);
    }
  }
  const groups = DESIGN_TOKEN_GROUPS.map((key) => {
    const entries = leaves
      .filter((leaf) => leaf.group === key)
      .map((leaf) => ({
        path: leaf.path,
        key: leaf.key,
        displayValue: String(leaf.value),
        unknown: leaf.unknown,
        hint: renderHintFor(leaf),
      }));
    if (entries.length === 0) {
      throw new Error(`design-tokens 组 ${key} 叶数为 0（组合同漂移——fail-closed）`);
    }
    return { key, title: GROUP_TITLES[key] ?? key, kind: GROUP_KINDS[key] ?? "table", note: GROUP_NOTES[key] ?? "", entries };
  });
  return {
    origin: String(doc?.meta?.origin ?? UNKNOWN_SENTINEL),
    customized: doc?.meta?.customized === true,
    sourcePath: DESIGN_TOKENS_SOURCE_POINTER,
    groups,
    leaves,
    valueCount: leaves.filter((leaf) => !leaf.unknown).length,
    unknownCount: leaves.filter((leaf) => leaf.unknown).length,
  };
}
