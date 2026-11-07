import type { Meta, StoryObj } from "@storybook/react";
import { QrCode } from "../components/ui/qrcode";
import { Frame, describe } from "./frame";

const meta: Meta<typeof QrCode> = {
  title: "Geist 组件/数据展示/QrCode 二维码",
  component: QrCode,
  parameters: describe("二维码：编码器在 src/lib/qrcode.ts（项目自带，字节模式、版本 1–10、纠错 L/M/Q/H，不引依赖），画成 SVG 并留 4 格静区；图下附原文，扫不了码的人也拿得到内容；内容过长显示错误态。Geist 没有二维码，按 antd QRCode 的能力用 Geist 色阶做。源码 src/components/ui/qrcode.tsx。", "qrcode"),
  args: { value: "https://river-singer.github.io/POMaster_VNext/", level: "M", size: 160 },
  argTypes: { level: { control: "select", options: ["L", "M", "Q", "H"] }, size: { control: { type: "range", min: 96, max: 256, step: 16 } } },
};
export default meta;
type Story = StoryObj<typeof QrCode>;

export const Playground: Story = { name: "实验场", render: (args) => <Frame><QrCode {...args} caption={args.value} /></Frame> };

export const Levels: Story = {
  name: "纠错等级与过长",
  render: () => (
    <Frame className="items-start">
      <QrCode value="ORD-20261107-0042" level="L" size={120} caption="订单 ORD-20261107-0042（L）" />
      <QrCode value="ORD-20261107-0042" level="H" size={120} caption="同一内容（H，可遮挡 30%）" />
      <QrCode value={"x".repeat(400)} size={120} />
    </Frame>
  ),
};
