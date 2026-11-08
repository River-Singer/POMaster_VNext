import type { Meta, StoryObj } from "@storybook/react";
import { BrowserFrame, PhoneFrame } from "../components/ui/device-frame";
import { StatusDot } from "../components/ui/status-dot";
import { Frame, describe } from "./frame";

const meta: Meta<typeof BrowserFrame> = {
  title: "Geist 组件/数据展示/DeviceFrame 设备外框",
  component: BrowserFrame,
  parameters: describe("给截图或演示套上浏览器窗口或手机外框，说明它在哪个环境里出现（文档、发布说明、引导页）；外框是装饰，地址栏只是文字。Geist 有 Browser / Phone；antd 没有对应组件。源码 src/components/ui/device-frame.tsx。", "device_frame"),
};
export default meta;
type Story = StoryObj<typeof BrowserFrame>;

export const Default: Story = {
  name: "浏览器与手机",
  render: () => (
    <Frame className="items-start gap-8">
      <BrowserFrame address="fleet.example.com/vehicles" className="w-96">
        <div className="flex flex-col gap-2 p-4">
          <p className="text-label-14">车辆列表</p>
          <StatusDot state="building" label="沪A·D2391 在途" />
          <StatusDot state="ready" label="沪A·D2392 空闲" />
        </div>
      </BrowserFrame>
      <PhoneFrame className="w-48">
        <div className="flex flex-col gap-2 p-4 pt-10">
          <p className="text-label-14">今日任务</p>
          <p className="text-copy-13 text-ds-gray-900">3 单待提货</p>
        </div>
      </PhoneFrame>
    </Frame>
  ),
};
