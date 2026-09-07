/**
 * config.ts —— `.pomaster/config.yaml` 人类偏好读取（信息性配置面）。
 *
 * 定位纪律（A1 同线）：config.yaml 是人类可编辑偏好文件，init 只在缺失时创建、
 * 永不覆盖；本模块只做**呈现位偏好**的行级读取，一切值都不进 gate/permit 判卷
 * （呈现 ≠ 治理输入）。目前只有一个键：
 * - `capability_tips`（09-06 能力显性化 C4）：`pomaster status` 尾部轮换 tip 开关。
 *   默认开——键缺席/文件缺席/值词形不识别一律按开呈现（向后兼容：旧项目 config
 *   无此键 = 默认开）；显式 `capability_tips: false` 才关闭（关闭 = 零输出）。
 *
 * 行级解析与 init.ts parseConfigProfile 同一形态（无 YAML 依赖的最小实现——
 * config.yaml 全部键都是扁平标量，行级解析即充分）。
 */

import { readFile } from "node:fs/promises";
import { configPath } from "./store-layout.js";

/** capability_tips 键词形（init CONFIG_TEMPLATE 模板与本解析器同一词形锚）。 */
export const CAPABILITY_TIPS_KEY = "capability_tips";

/**
 * 行级解析 config 文本 → capability_tips 开关。fail-open 语义（呈现位偏好，
 * 向后兼容）：键缺席 / 文本不可解析 / 值词形非 false 一律 true；仅显式
 * `capability_tips: false`（容忍引号与行内注释）返回 false。
 */
export function parseCapabilityTipsEnabled(configText: string): boolean {
  const match = new RegExp(`^\\s*${CAPABILITY_TIPS_KEY}:\\s*(\\S+)`, "m").exec(
    configText,
  );
  const value = match?.[1];
  if (value === undefined) return true;
  const bare = value.split("#")[0]?.trim().replace(/^["']|["']$/g, "") ?? "";
  return bare !== "false";
}

/**
 * 读盘版：config.yaml 缺席/不可读 → 默认开（true）。纯读零写入；读路径降级
 * fail-open（呈现位偏好，不值得为此告警——与 parseConfigProfile 缺省 LIGHT 同线）。
 */
export async function readCapabilityTipsEnabled(rootDir: string): Promise<boolean> {
  let raw: string;
  try {
    raw = await readFile(configPath(rootDir), "utf8");
  } catch {
    return true;
  }
  return parseCapabilityTipsEnabled(raw);
}
