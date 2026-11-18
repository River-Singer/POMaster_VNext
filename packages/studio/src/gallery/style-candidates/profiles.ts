// 样式候选的两个主题档（IN-2b / kickoff 确认单第 4 节）。
//
// 候选目录的单一事实源在 CLI（packages/cli/src/style-candidates.ts，纯数据）：编号、标题、
// 摘要与 token 合同覆盖都从那里来；本文件只把编号映射成 antdv ConfigProvider 的 theme 配置
// （运行时机制：compact = 官方紧凑算法 + 合同里记录的 controlHeight 覆盖）。
// tests/style-candidates.spec.ts 跨包对账：id、顺序、覆盖键与 CLI 目录一致——画廊不自造第二份候选。
import { theme } from "ant-design-vue";

export interface StyleThemeProfile {
  /** 与 CLI 候选目录的 id 一致（standard / compact）。 */
  readonly id: string;
  readonly title_zh: string;
  readonly summary_zh: string;
  /** ConfigProvider 的 theme 值。standard 为空对象（默认算法、无 token 覆盖）。 */
  readonly theme: Record<string, unknown>;
}

export const STANDARD_PROFILE: StyleThemeProfile = {
  id: "standard",
  title_zh: "标准密度（预设原样）",
  summary_zh: "与 Ant Design 默认主题一致：控件高 32、圆角 6、默认间距。表单为主、行数不多的业务后台够用。",
  theme: {},
};

export const COMPACT_PROFILE: StyleThemeProfile = {
  id: "compact",
  title_zh: "紧凑工作台",
  summary_zh: "控件与行距整体收紧（Ant Design 官方紧凑算法 compactAlgorithm），token 合同把控件高度收到 24（官方 controlHeightSM 词形）。",
  // 算法整体收紧尺寸与间距；token.controlHeight 24 与确认单签下的 density.control_height 覆盖同值，
  // 保证预览与 PL-1 将来生成的主题一致。
  theme: { algorithm: theme.compactAlgorithm, token: { controlHeight: 24 } },
};

export const STYLE_THEME_PROFILES: readonly StyleThemeProfile[] = [STANDARD_PROFILE, COMPACT_PROFILE];
