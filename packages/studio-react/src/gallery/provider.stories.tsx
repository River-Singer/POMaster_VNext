import type { Meta, StoryObj } from "@storybook/react";
import { GeistProvider, useGeistConfig } from "../components/ui/provider";
import { RelativeTime } from "../components/ui/relative-time";
import { Column, describe } from "./frame";

const meta: Meta<typeof GeistProvider> = {
  title: "Geist 组件/其他/GeistProvider 全局配置",
  component: GeistProvider,
  parameters: describe("应用根部放一次的全局配置：语言与地区（日期、数字格式化读这里）、主题偏好（写到根元素的 data-theme 与 color-scheme）、文字提示的统一延迟、组件默认尺寸；组件用 useGeistConfig() 读取。Geist 没有 ConfigProvider，按 antd ConfigProvider 的职责用 React Context 做。源码 src/components/ui/provider.tsx。", "config_provider"),
};
export default meta;
type Story = StoryObj<typeof GeistProvider>;

function ConfigReadout() {
  const config = useGeistConfig();
  const sample = new Intl.NumberFormat(config.locale).format(1286.5);
  return (
    <ul className="flex flex-col gap-1 text-copy-14">
      <li>语言：{config.locale}（数字示例 {sample}）</li>
      <li>主题：{config.theme}</li>
      <li>默认尺寸：{config.size}</li>
      <li>
        相对时间：<RelativeTime date={new Date(Date.now() - 5 * 60_000)} />
      </li>
    </ul>
  );
}

export const Default: Story = {
  name: "读取配置",
  render: () => (
    <Column>
      <GeistProvider locale="zh-CN" theme="light" size="small">
        <ConfigReadout />
      </GeistProvider>
    </Column>
  ),
};
