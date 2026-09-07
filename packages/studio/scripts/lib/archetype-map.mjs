// archetype↔组件映射层（S4 · Owner 裁定 09-06 候选 B）：映射数据加载与双向派生。
//
// 数据源（受 pin 的仓内文件）：archetype-component-map.json——41 张 archetype 逐卡
// 「建议组件组合」，每条 mapping.basis 逐条引用 archetype 语义字段或 seeds 主题文档
// （单一事实源，画廊生成器只读消费）。本模块是画廊侧策展配置的加载器：不新增
// catalog 物料（D6 分母零新增），映射语义为 NON-AUTHORITATIVE 呈现辅助。
//
// 双向消费（Owner 裁定「呈现双向」）：
// - 正向：archetypes.mjs 在每张语义卡渲染「建议组件组合」节；
// - 反向：components.mjs 在组件 story 的 docs 描述渲染「服务场景」注记。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./common.mjs";

const MAP_PATH = join(REPO_ROOT, "packages", "studio", "scripts", "lib", "archetype-component-map.json");

/** 读映射表（每次读取，保持生成器确定性；调用方缓存于模块级）。 */
export function readArchetypeComponentMap() {
  const parsed = JSON.parse(readFileSync(MAP_PATH, "utf8"));
  if (parsed.map_version !== 1) {
    throw new Error(`archetype-component-map.json map_version 漂移: ${parsed.map_version}`);
  }
  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error("archetype-component-map.json 缺 entries（映射表为空）");
  }
  return parsed;
}

/** 映射表 → 校验后的结构视图（archetype 文件名 → 组件映射数组）。 */
export function indexArchetypeMapByFile(map) {
  const byFile = new Map();
  for (const entry of map.entries) {
    if (byFile.has(entry.archetype)) {
      throw new Error(`archetype-component-map.json archetype 条目重复: ${entry.archetype}`);
    }
    if (!Array.isArray(entry.mappings) || entry.mappings.length === 0) {
      throw new Error(`映射条目缺 mappings: ${entry.archetype}`);
    }
    for (const mapping of entry.mappings) {
      if (typeof mapping.component !== "string" || mapping.component.length === 0) {
        throw new Error(`映射条目出现空组件名: ${entry.archetype}`);
      }
      if (typeof mapping.basis !== "string" || mapping.basis.trim().length === 0) {
        throw new Error(`映射缺依据标注（basis 必填，逐条可溯源）: ${entry.archetype} → ${mapping.component}`);
      }
    }
    byFile.set(entry.archetype, entry.mappings);
  }
  return byFile;
}

/** 反向派生：组件族主组件名 → [ { archetype, title } ]（按 archetype 文件名序）。 */
export function deriveReverseMap(map, familyPrimaries) {
  const primaries = new Set(familyPrimaries);
  const reverse = new Map();
  for (const entry of map.entries) {
    for (const mapping of entry.mappings) {
      if (!primaries.has(mapping.component)) {
        throw new Error(
          `映射引用了不在 71 组件族清单内的词形: ${entry.archetype} → ${mapping.component}`,
        );
      }
      const list = reverse.get(mapping.component) ?? [];
      list.push({ archetype: entry.archetype, title: mapping.basis });
      reverse.set(mapping.component, list);
    }
  }
  return reverse;
}
