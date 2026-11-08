import type { Meta, StoryObj } from "@storybook/vue3";
import { ref } from "vue";
import { Button, Card, ConfigProvider, Tag } from "ant-design-vue";
import { PmThemeSwitcher, usePmThemeAlgorithm, type PmThemePreference } from "../components/theme-switcher";
import { DEMO_STYLE, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/ThemeSwitcher 主题切换",
  parameters: describe("跟随系统 / 浅色 / 深色三段（antdv Segmented）；选择交给 ConfigProvider 的 theme.algorithm（defaultAlgorithm / darkAlgorithm），下面的卡片随之切换。偏好的持久化由调用处负责。ant-design-vue 没有成品主题切换（Geist 有 Theme Switcher）。源码 src/components/theme-switcher.ts。", "theme_switcher"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmThemeSwitcher, AConfigProvider: ConfigProvider, ACard: Card, AButton: Button, ATag: Tag },
    setup() {
      const preference = ref<PmThemePreference>("light");
      const resolved = usePmThemeAlgorithm(() => preference.value);
      return { DEMO_STYLE, preference, resolved };
    },
    template: `
      <div :style="DEMO_STYLE + ';flex-direction:column'">
        <PmThemeSwitcher v-model:value="preference" />
        <a-config-provider :theme="{ algorithm: resolved.algorithm }">
          <a-card title="沪A·D2391" style="width:320px"><p>厢式冷链车，归属浦东车队一组。</p><a-tag color="processing">在途</a-tag><a-button type="primary" size="small">派单</a-button></a-card>
        </a-config-provider>
      </div>`,
  }),
};
