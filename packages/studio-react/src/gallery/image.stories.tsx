import type { Meta, StoryObj } from "@storybook/react";
import { Image } from "../components/ui/image";
import truck from "./assets/truck.svg";
import { Frame, describe } from "./frame";

// 解码失败的图片数据：演示加载失败的样子，不发网络请求。
const BROKEN = "data:image/png;base64,AAAA";

const meta: Meta<typeof Image> = {
  title: "Geist 组件/数据展示/Image 图片",
  component: Image,
  parameters: describe("图片：固定宽高比占位（加载前后不跳布局）、懒加载、失败时显示说明而不是破图标；alt 必填（装饰图写空串）；preview 加一个「查看大图」按钮打开对话框。Geist 的 Image 基于 next/image；这里是框架无关的同等能力。源码 src/components/ui/image.tsx。", "image"),
};
export default meta;
type Story = StoryObj<typeof Image>;

export const Default: Story = {
  name: "比例、预览与失败",
  render: () => (
    <Frame className="items-start">
      <Image src={truck} alt="停在仓库门口的厢式货车" ratio="4/3" preview className="w-64" />
      <Image src={truck} alt="停在仓库门口的厢式货车（方形裁切）" ratio="1/1" className="w-40" />
      <Image src={BROKEN} alt="车辆左侧照片" ratio="4/3" className="w-48" />
    </Frame>
  ),
};
