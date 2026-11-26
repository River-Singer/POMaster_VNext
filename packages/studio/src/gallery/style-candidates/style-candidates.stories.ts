// 「样式候选」分区（IN-2b / kickoff 确认单第 4 节，D-5）：两套候选在 Storybook 里比较——
// 同一组代表页面（列表页 / 复杂表单 / 详情页）、同一份数据，只有 ConfigProvider 的 theme 不同。
// 候选目录（编号 / 标题 / token 覆盖）的单一事实源在 CLI packages/cli/src/style-candidates.ts，
// 画廊在 tests/style-candidates.spec.ts 里与它对账；Owner 在 kickoff 的 choices.yaml 写
// style: standard | compact，confirm 后落进项目设计规范（design adopt 同一路径 + token 收紧）。
import type { Meta, StoryObj } from "@storybook/vue3";
import { ConfigProvider } from "ant-design-vue";
import { COMPACT_PROFILE, STANDARD_PROFILE, STYLE_THEME_PROFILES, type StyleThemeProfile } from "./profiles";
import { detailPage, formPage, listPage, type PageComponent } from "./representative-pages";
import { describe } from "../_demo";

const meta: Meta = {
  title: "样式候选",
  parameters: describe(
    "启动确认单（kickoff）第 4 节的两套样式方案：同一组代表页面——列表页、复杂表单、详情页——在两套候选下各渲染一份，页面与数据相同，只有 ConfigProvider 的 theme 不同。候选目录的单一事实源在 CLI（packages/cli/src/style-candidates.ts，纯数据）；Owner 在 choices.yaml 写 style: standard | compact，kickoff confirm 后选定候选落进项目设计规范。",
    "style-candidates",
  ),
};
export default meta;

/** 把代表页面套进候选主题：内层 setup 状态摊平进外层组件，模板整体包一层 a-config-provider。 */
function themed(profile: StyleThemeProfile, page: () => PageComponent): StoryObj {
  const inner = page();
  return {
    render: () => ({
      components: { AConfigProvider: ConfigProvider },
      setup() {
        return { theme: profile.theme, ...inner.setup() };
      },
      template: `<a-config-provider :theme="theme">${inner.template}</a-config-provider>`,
    }),
  };
}

export const Overview: StoryObj = {
  render: () => ({
    components: { AConfigProvider: ConfigProvider },
    setup() {
      return { profiles: STYLE_THEME_PROFILES };
    },
    template: `
<div style="padding:24px;display:flex;flex-direction:column;gap:16px">
  <p style="margin:0">启动确认单第 4 节：恰好两套候选，在下面三个代表页面上比较关键样式与交互；选定结果进设计规范（D-5）。</p>
  <div v-for="profile in profiles" :key="profile.id" style="border:1px solid #d9d9d9;border-radius:8px;padding:16px">
    <h3 style="margin:0 0 8px">{{ profile.id }} · {{ profile.title_zh }}</h3>
    <p style="margin:0 0 12px">{{ profile.summary_zh }}</p>
    <a-config-provider :theme="profile.theme">
      <a-space wrap>
        <a-button>默认按钮</a-button>
        <a-button type="primary">主按钮</a-button>
        <a-input style="width:200px" placeholder="输入框" />
        <a-tag>标签</a-tag>
        <a-switch />
        <a-pagination simple :default-current="2" :total="50" />
      </a-space>
    </a-config-provider>
  </div>
</div>`.trim(),
  }),
};

export const StandardList: StoryObj = themed(STANDARD_PROFILE, listPage);
export const StandardForm: StoryObj = themed(STANDARD_PROFILE, formPage);
export const StandardDetail: StoryObj = themed(STANDARD_PROFILE, detailPage);
export const CompactList: StoryObj = themed(COMPACT_PROFILE, listPage);
export const CompactForm: StoryObj = themed(COMPACT_PROFILE, formPage);
export const CompactDetail: StoryObj = themed(COMPACT_PROFILE, detailPage);
