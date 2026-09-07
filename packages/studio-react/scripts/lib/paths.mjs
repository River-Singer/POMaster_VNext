// React sidecar 路径解析（与 Vue 主实例 common.mjs 同源纪律；本包不重复 MDX 转义面——
// 生成器产出 tsx story 非 MDX，映射表加载跨包复用 studio 的 archetype-map.mjs）。
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const LIB_DIR_URL = import.meta.url;
/** React sidecar 包根。 */
export const STUDIO_REACT_ROOT = fileURLToPath(new URL("../../", LIB_DIR_URL));
/** 生成产物根（gitignore——入库的是生成器，不是产物）。 */
export const GENERATED_DIR = join(STUDIO_REACT_ROOT, "generated");
