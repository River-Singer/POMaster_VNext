import type { Meta, StoryObj } from "@storybook/react";
import { Breadcrumb } from "../components/ui/breadcrumb";
import { Button } from "../components/ui/button";
import { PageHeader } from "../components/ui/page-header";
import { StatusDot } from "../components/ui/status-dot";
import { Column, describe } from "./frame";

const meta: Meta<typeof PageHeader> = {
  title: "Geist 组件/数据展示/PageHeader 页头",
  component: PageHeader,
  parameters: describe("页面顶部：面包屑 + 返回 + 页面唯一的 h1 + 描述 + 元信息 + 主操作（最多一个主按钮）。antd v5 的 PageHeader 已移到 pro-components，这里用 Geist 的排版与按钮组合。源码 src/components/ui/page-header.tsx。", "page_header"),
};
export default meta;
type Story = StoryObj<typeof PageHeader>;

export const Default: Story = {
  name: "详情页页头",
  render: () => (
    <Column className="w-full">
      <PageHeader
        className="w-full"
        breadcrumb={<Breadcrumb items={[{ label: "车队", href: "#fleet" }, { label: "车辆", href: "#vehicles" }, { label: "沪A·D2391" }]} />}
        backHref="#vehicles"
        title="沪A·D2391"
        description="厢式冷链车，归属浦东车队一组。"
        meta={<><StatusDot state="building" label="在途" /><span>司机 张伟</span></>}
        actions={<><Button variant="secondary">编辑</Button><Button>派单</Button></>}
      />
    </Column>
  ),
};
