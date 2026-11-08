import type { Meta, StoryObj } from "@storybook/react";
import { Carousel } from "../components/ui/carousel";
import { Column, describe } from "./frame";

const meta: Meta<typeof Carousel> = {
  title: "Geist 组件/数据展示/Carousel 走马灯",
  component: Carousel,
  parameters: describe("横向滚动吸附的幻灯片：上一张 / 下一张按钮 + 页码圆点（每个都是带名称的按钮），左右键翻页，不自动轮播。Geist 没有 Carousel，按 antd Carousel 的能力做，去掉自动播放。源码 src/components/ui/carousel.tsx。", "carousel"),
};
export default meta;
type Story = StoryObj<typeof Carousel>;

const Slide = ({ title, body }: { readonly title: string; readonly body: string }) => (
  <div className="flex h-40 flex-col justify-center gap-2 bg-ds-background-200 px-8">
    <p className="text-heading-20">{title}</p>
    <p className="text-copy-14 text-ds-gray-900">{body}</p>
  </div>
);

export const Default: Story = {
  name: "翻页",
  render: () => (
    <Column className="w-full max-w-lg">
      <Carousel
        label="本周车队动态"
        className="w-full"
        slides={[
          <Slide key="a" title="准点率 98.2%" body="较上周提升 1.4 个百分点。" />,
          <Slide key="b" title="新增 6 辆冷链车" body="已分配到浦东车队一组。" />,
          <Slide key="c" title="11 月 12 日年检" body="12 辆车需要在 11 月底前完成年检。" />,
        ]}
      />
    </Column>
  ),
};
