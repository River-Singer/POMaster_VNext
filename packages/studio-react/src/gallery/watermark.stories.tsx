import type { Meta, StoryObj } from "@storybook/react";
import { Descriptions } from "../components/ui/descriptions";
import { Watermark } from "../components/ui/watermark";
import { Column, describe } from "./frame";

const meta: Meta<typeof Watermark> = {
  title: "Geist 组件/反馈/Watermark 水印",
  component: Watermark,
  parameters: describe("在敏感页面上铺倾斜的重复文字（姓名 + 工号 + 日期）用于截图追溯：这是威慑，不是安全措施，数据仍靠权限控制；水印层 aria-hidden、不拦截点击与选择，颜色用半透明灰，不影响正文对比度。Geist 没有 Watermark，按 antd Watermark 的能力做。源码 src/components/ui/watermark.tsx。", "watermark"),
};
export default meta;
type Story = StoryObj<typeof Watermark>;

export const Default: Story = {
  name: "司机信息页",
  render: () => (
    <Column className="w-full">
      <Watermark content={["张调度 · 10086", "2026-11-07"]} className="w-full rounded-lg border border-ds-gray-400 p-6">
        <Descriptions
          className="w-full"
          items={[
            { label: "姓名", value: "张伟" },
            { label: "手机号", value: "138 **** 2391" },
            { label: "身份证号", value: "3101**********1234" },
            { label: "驾驶证档案号", value: "310100123456" },
            { label: "紧急联系人", value: "李娜 139 **** 0042" },
          ]}
        />
      </Watermark>
    </Column>
  ),
};
