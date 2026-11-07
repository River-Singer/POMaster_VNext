// 总 Storybook 的「抽屉」：Vue · Ant Design 与 React · Geist 两个画廊组合进同一个 Storybook（Storybook Composition）。
//
// 项目还没定前端架构时两个抽屉都在，结构一致、内容各自是本体系的规范；架构锁定之后只留对应的那一个，
// 另一个直接不出现。锁定的来源（按优先级）：
//   1. 环境变量 POMASTER_STUDIO_SYSTEM=antd | geist（显式指定）；
//   2. 环境变量 POMASTER_STUDIO_PROJECT 指向的项目里，已落地的规范
//      .pomaster/baseline/frontend/design-standard.yaml 的 meta.design_system（项目锁定了哪套体系）。
// 都没有就两个都留（本仓库的缺省：两套预设并排）。
//
// 总 Storybook 的配置在 packages/studio-react/.storybook-host/（借用 React 画廊已装好的 Storybook 工具链），
// 编排脚本在 scripts/studio.mjs。
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

/** 两个抽屉：id 也是组合后的 ref 键与静态发布的子路径。 */
export const DRAWERS = [
  { id: "vue", title: "Vue · Ant Design", system: "antd", package: "packages/studio", port: 6006 },
  { id: "react", title: "React · Geist", system: "geist", package: "packages/studio-react", port: 6007 },
];

/** 总 Storybook 的端口（dev）。 */
export const HOST_PORT = 6008;

/** 在线发布位（studio-pages 工作流）：总 Storybook 在根路径，抽屉在 vue/、react/ 子路径。 */
export const DEFAULT_SITE_URL = "https://river-singer.github.io/POMaster_VNext/";

/** 项目锁定的设计体系（读已落地规范的 meta.design_system）；没有落地规范返回 null。 */
export function lockedSystem(projectDir) {
  if (!projectDir) return null;
  const file = join(projectDir, ".pomaster", "baseline", "frontend", "design-standard.yaml");
  if (!existsSync(file)) return null;
  const doc = yaml.load(readFileSync(file, "utf8"));
  const system = doc && typeof doc === "object" && doc.meta && typeof doc.meta === "object" ? doc.meta.design_system : null;
  return DRAWERS.some((drawer) => drawer.system === system) ? system : null;
}

/**
 * 项目落地的规范：POMASTER_STUDIO_PROJECT 指向的项目里，体系与 system 一致的
 * .pomaster/baseline/frontend/design-standard.yaml。画廊的「规范」分区据此生成，看到的就是项目自己的规范
 * （改过的参数、定下的决策位）；没有就用工具预设。token 表取项目的，项目没有再退回预设。
 */
export function projectStandard(system, env = process.env) {
  const dir = env.POMASTER_STUDIO_PROJECT;
  if (!dir || lockedSystem(dir) !== system) return null;
  const base = join(dir, ".pomaster", "baseline", "frontend");
  const tokens = join(base, "design-tokens.yaml");
  return {
    standardPath: join(base, "design-standard.yaml"),
    tokensPath: existsSync(tokens) ? tokens : null,
    pointer: ".pomaster/baseline/frontend/design-standard.yaml",
    tokensPointer: ".pomaster/baseline/frontend/design-tokens.yaml",
  };
}

/** 当前应出现的抽屉，以及为什么（给编排脚本打印、给说明页展示）。 */
export function resolveDrawers(env = process.env) {
  const explicit = env.POMASTER_STUDIO_SYSTEM;
  if (explicit !== undefined && explicit !== "" && explicit !== "both") {
    const drawers = DRAWERS.filter((drawer) => drawer.system === explicit);
    if (drawers.length === 0) throw new Error(`POMASTER_STUDIO_SYSTEM=${explicit} 不认识（可选 antd、geist、both）`);
    return { drawers, reason: `POMASTER_STUDIO_SYSTEM=${explicit}` };
  }
  const locked = explicit === "both" ? null : lockedSystem(env.POMASTER_STUDIO_PROJECT);
  if (locked !== null) {
    return { drawers: DRAWERS.filter((drawer) => drawer.system === locked), reason: `项目已锁定 ${locked}（${env.POMASTER_STUDIO_PROJECT}）` };
  }
  return { drawers: [...DRAWERS], reason: "架构未锁定，两个抽屉都在" };
}

/** 发布位地址（去掉末尾斜杠，组合时拼 /index.json）。 */
export function siteUrl(env = process.env) {
  return (env.POMASTER_STUDIO_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

/** 组合配置里的 refs：dev 指向本机端口，静态构建指向发布位的子路径。 */
export function drawerRefs(configType, env = process.env) {
  const { drawers } = resolveDrawers(env);
  return Object.fromEntries(
    drawers.map((drawer) => [
      drawer.id,
      { title: drawer.title, url: configType === "DEVELOPMENT" ? `http://localhost:${drawer.port}` : `${siteUrl(env)}/${drawer.id}`, expanded: true },
    ]),
  );
}
