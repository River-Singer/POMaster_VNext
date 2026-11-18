/**
 * style-candidates.ts —— 启动确认单的样式候选（code-spec kickoff §「样式候选」；PRD 11-11-agent-autopilot D-5 / IN-2b）。
 *
 * Owner 2026-11-17 定案：恰好 2 套候选方案，每套在 Storybook 用同一组代表页面（列表、复杂表单、详情）比较；
 * 选定结果进设计规范。设计体系跟着确认单技术基线的前端框架走（vue3 → antd，react → geist——与
 * scaffold-frontend-stack 的支持面同源），候选是同一体系内的两套密度方案：
 *
 * - `standard` 标准密度：设计规范预设原样（Ant Design 默认主题 / Geist 预设），无覆盖；
 * - `compact` 紧凑工作台：antd 官方 compactAlgorithm（ConfigProvider theme.algorithm，运行时机制），
 *   token 合同只收有官方词形的键（controlHeightSM）。数值纪律同 seeds：只收官方词形，
 *   没有官方词形的键不发明（宁缺毋假）。
 *
 * 本模块零依赖（node 与浏览器/测试共用）：候选目录是纯数据，Studio 画廊按 id 映射成各库的主题配置；
 * `applyTokenDeltas` 是纯函数的文本级替换（保注释保格式，与 design set 同一纪律）。
 *
 * 第一轮范围：antd 体系给满 2 套（内部首个里程碑即 Vue + antdv 示例）；geist 体系的第二套候选还没有
 * 经官方数值定稿——react 架构的确认单如实标注「待补」，落库按 standard（预设原样）走，不猜数值。
 */
/** 样式候选与落库回执的 schema（style.json）。 */
export const KICKOFF_STYLE_SCHEMA = "pomaster.kickoff-style/v1";

export type KickoffDesignSystem = "antd" | "geist";

/** 设计体系跟着前端框架走：与 scaffold-frontend-stack.ts 同一映射（vue → antd，react → geist）。
 *  词界与它同款：值常带版本后缀（vue3），(^|[^a-z0-9]) 词界才认得 vue3 里的 vue。 */
export function systemOfFramework(framework: string | null): KickoffDesignSystem | null {
  if (framework === null) return null;
  if (/(^|[^a-z0-9])react/i.test(framework)) return "geist";
  if (/(^|[^a-z0-9])vue/i.test(framework)) return "antd";
  return null;
}

/** 候选覆盖的一个键：token 合同（design-tokens.yaml）里的 `<组>.<键>`、目标值与官方词形出处。 */
export interface StyleTokenDelta {
  readonly path: string;
  readonly value: string;
  /** 官方词形（写进 token 行尾注释的出处）。 */
  readonly wordform: string;
  readonly note_zh: string;
}

/** Storybook 代表页面（每套候选都展示同一组）。 */
export interface StyleRepresentativePage {
  readonly key: "list" | "form" | "detail";
  readonly title_zh: string;
}

export interface StyleCandidate {
  readonly id: "standard" | "compact";
  readonly title_zh: string;
  readonly summary_zh: string;
  /** 运行时机制：antd 的 ConfigProvider theme.algorithm（"compact"）；standard 为 null。 */
  readonly algorithm: "compact" | null;
  /** 相对预设原样的 token 合同覆盖（standard 为空）。 */
  readonly token_deltas: readonly StyleTokenDelta[];
}

export interface StyleCatalog {
  readonly design_system: KickoffDesignSystem;
  readonly ui_library: string;
  readonly candidates: readonly StyleCandidate[];
  readonly representative_pages: readonly StyleRepresentativePage[];
  /** 候选没有给满 2 套时如实说明（geist 第一轮待补）；给满时为 null。 */
  readonly note_zh: string | null;
}

export const REPRESENTATIVE_PAGES: readonly StyleRepresentativePage[] = [
  { key: "list", title_zh: "列表页" },
  { key: "form", title_zh: "复杂表单" },
  { key: "detail", title_zh: "详情页" },
];

const ANTD_CANDIDATES: readonly StyleCandidate[] = [
  {
    id: "standard",
    title_zh: "标准密度（预设原样）",
    summary_zh: "与 Ant Design 默认主题一致：控件高 32、圆角 6、默认间距。表单为主、行数不多的业务后台够用。",
    algorithm: null,
    token_deltas: [],
  },
  {
    id: "compact",
    title_zh: "紧凑工作台",
    summary_zh: "控件与行距整体收紧（Ant Design 官方紧凑算法 compactAlgorithm）：表格密集、一屏多行的管理台信息密度更高。token 合同把控件高度收到 24（官方 controlHeightSM 词形）。",
    algorithm: "compact",
    token_deltas: [
      {
        path: "density.control_height",
        value: "24",
        wordform: "genControlHeight.controlHeightSM",
        note_zh: "紧凑算法生效后的控件高度（缺省 32 → 24）",
      },
    ],
  },
];

/** 候选目录：antd 给满 2 套；geist 第一轮待补（不猜数值，如实标注）。 */
export function styleCatalogFor(system: KickoffDesignSystem): StyleCatalog {
  if (system === "antd") {
    return { design_system: "antd", ui_library: "ant-design-vue@4.2.6", candidates: ANTD_CANDIDATES, representative_pages: REPRESENTATIVE_PAGES, note_zh: null };
  }
  return {
    design_system: "geist",
    ui_library: "shadcn/ui + Tailwind CSS 4",
    candidates: [
      {
        id: "standard",
        title_zh: "标准密度（预设原样）",
        summary_zh: "与 Vercel Geist 预设一致，无覆盖。",
        algorithm: null,
        token_deltas: [],
      },
    ],
    representative_pages: REPRESENTATIVE_PAGES,
    note_zh: "Geist 体系的第二套候选还没有经官方数值定稿（宁缺毋假）：先按 standard（预设原样）落规范，定稿后补齐两套比较。",
  };
}

/** choices.yaml 的 style 校验：null/空 = 未选（缺省 standard）；写了不存在的编号 → 问题文案。 */
export function styleChoiceProblem(style: string | null, catalog: StyleCatalog | null): string | null {
  if (style === null || style === "") return null;
  if (catalog === null) return `choices.yaml 的 style「${style}」写不了：前端框架还没定，样式候选要等框架定了再出`;
  const ids = catalog.candidates.map((candidate) => candidate.id);
  if (!ids.includes(style as StyleCandidate["id"])) {
    const suffix = catalog.note_zh === null ? ids.join(" / ") : `${ids.join(" / ")}（${catalog.note_zh}）`;
    return `choices.yaml 的 style「${style}」不是候选编号：${suffix}`;
  }
  return null;
}

export interface ResolvedStyleChoice {
  /** null = 前端框架还没定（落库记 skipped）。 */
  readonly system: KickoffDesignSystem | null;
  /** null = 该体系还没有候选目录（落库记 skipped）或候选缺失。 */
  readonly candidate: StyleCandidate | null;
  readonly disposition: "answered" | "default" | "skipped";
}

/** 落库用：确认单的 style 段 + choices 的选择 → 要采用的候选。未知编号进不了这里（draft/confirm 已拦）。 */
export function resolveStyleChoice(style: {
  readonly design_system: KickoffDesignSystem | null;
  readonly candidates: readonly StyleCandidate[];
  readonly choice: string | null;
}): ResolvedStyleChoice {
  if (style.design_system === null || style.candidates.length === 0) return { system: style.design_system, candidate: null, disposition: "skipped" };
  const chosen = style.choice === null ? undefined : style.candidates.find((candidate) => candidate.id === style.choice);
  const candidate = chosen ?? style.candidates.find((entry) => entry.id === "standard") ?? null;
  return { system: style.design_system, candidate, disposition: chosen !== undefined ? "answered" : candidate === null ? "skipped" : "default" };
}

export interface TokenDeltaResult {
  readonly text: string;
  /** 实际改了值的键（path）。 */
  readonly changed: readonly string[];
  /** 值已经是目标值的键（幂等重跑）。 */
  readonly already: readonly string[];
  /** 找不到键行的键（种子漂移——调用方 fail-closed）。 */
  readonly missing: readonly string[];
}

/**
 * 文本级应用 token 覆盖（design set 同一纪律：只改那一行，保注释与格式）：
 * - 按 `<组>.<键>` 定位：组是顶层无缩进行（如 `density:`），键是组内两空格缩进行；
 * - 改成 `  键: 值 # <- 词形（<备注>）`；
 * - 有改动时把 meta 翻成 customized（`origin: customized` + `customized: true`）；
 * - 幂等：值已是目标值则跳过、meta 已 customized 不再动。
 */
export function applyTokenDeltas(text: string, ref_zh: string, deltas: readonly StyleTokenDelta[]): TokenDeltaResult {
  const lines = text.split("\n");
  const changed: string[] = [];
  const already: string[] = [];
  const missing: string[] = [];
  for (const delta of deltas) {
    const dot = delta.path.indexOf(".");
    const group = dot === -1 ? delta.path : delta.path.slice(0, dot);
    const key = dot === -1 ? "" : delta.path.slice(dot + 1);
    const groupAt = lines.findIndex((line) => line === `${group}:`);
    if (groupAt === -1) {
      missing.push(delta.path);
      continue;
    }
    let keyAt = -1;
    for (let index = groupAt + 1; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      if (!/^ {2}\S/.test(line)) break;
      if (line.startsWith(`  ${key}:`)) {
        keyAt = index;
        break;
      }
    }
    if (keyAt === -1) {
      missing.push(delta.path);
      continue;
    }
    const line = lines[keyAt] ?? "";
    const current = line.slice(`  ${key}:`.length).split("#")[0]?.trim() ?? "";
    if (current === delta.value) {
      already.push(delta.path);
      continue;
    }
    lines[keyAt] = `  ${key}: ${delta.value} # <- ${delta.wordform}（${ref_zh}；${delta.note_zh}，原 ${current}）`;
    changed.push(delta.path);
  }
  if (changed.length > 0) {
    const originAt = lines.findIndex((line) => line === "  origin: preset");
    if (originAt !== -1) lines[originAt] = "  origin: customized";
    const customizedAt = lines.findIndex((line) => line === "  customized: false");
    if (customizedAt !== -1) lines[customizedAt] = "  customized: true";
  }
  return { text: lines.join("\n"), changed, already, missing };
}
