import type { Meta, StoryObj } from "@storybook/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Tabs> = {
  title: "Geist 组件/Tabs 标签页",
  component: Tabs,
  parameters: describe("Radix Tabs（Geist 的下划线样式）：方向键切换，内容区与标签互相关联。只用于同一对象的平级视图。规则见「规范/组件/导航/标签页」。源码 src/components/ui/tabs.tsx。"),
};
export default meta;
type Story = StoryObj<typeof Tabs>;

export const Basic: Story = {
  name: "平级视图",
  render: () => (
    <Frame>
      <Tabs defaultValue="repair" className="w-[480px]">
        <TabsList>
          <TabsTrigger value="base">基本信息</TabsTrigger>
          <TabsTrigger value="repair">维修记录（3）</TabsTrigger>
          <TabsTrigger value="cost">费用</TabsTrigger>
          <TabsTrigger value="archive" disabled>
            归档
          </TabsTrigger>
        </TabsList>
        <TabsContent value="base" className="text-copy-14">沪A12345 · 轻型厢式货车 · 2024-03-18 购置</TabsContent>
        <TabsContent value="repair" className="text-copy-14">最近一次维修：2026-10-12 更换前保险杠。</TabsContent>
        <TabsContent value="cost" className="text-copy-14">本年费用合计 ¥12,480.00</TabsContent>
      </Tabs>
    </Frame>
  ),
};
