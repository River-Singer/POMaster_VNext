import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { GeistProvider } from "../components/ui/provider";
import { ThemeSwitcher, type ThemePreference } from "../components/ui/theme-switcher";
import { Column, describe } from "./frame";

const meta: Meta<typeof ThemeSwitcher> = {
  title: "Geist 组件/数据录入/ThemeSwitcher 主题切换",
  component: ThemeSwitcher,
  parameters: describe("跟随系统 / 浅色 / 深色三段切换（Segmented，图标段带可读名称）；选择交给 GeistProvider 写到根元素的 data-theme 与 color-scheme，偏好的持久化由调用处负责。本抽屉只引入了 Geist 的浅色色阶，深色色值拿到官方数据后补进 geist.css。Geist 有 Theme Switcher；antd 没有对应组件。源码 src/components/ui/theme-switcher.tsx。", "theme_switcher"),
};
export default meta;
type Story = StoryObj<typeof ThemeSwitcher>;

function Demo() {
  const [theme, setTheme] = React.useState<ThemePreference>("system");
  return (
    <Column>
      <ThemeSwitcher value={theme} onValueChange={setTheme} />
      <GeistProvider theme={theme}>
        <span className="text-copy-13 text-ds-gray-900">当前偏好：{theme === "system" ? "跟随系统" : theme === "light" ? "浅色" : "深色"}</span>
      </GeistProvider>
    </Column>
  );
}

export const Default: Story = { name: "三段切换", render: () => <Demo /> };
