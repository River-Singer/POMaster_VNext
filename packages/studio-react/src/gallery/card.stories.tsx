import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Card> = {
  title: "Geist 组件/数据展示/Card 卡片",
  component: Card,
  parameters: describe("信息分组的容器：标题说清内容，补充说明放描述，底部只放与卡片内容相关的动作。规则见「规范/组件/数据展示/卡片」。源码 src/components/ui/card.tsx。", "card"),
};
export default meta;
type Story = StoryObj<typeof Card>;

export const Basic: Story = {
  name: "标题、内容与操作",
  render: () => (
    <Frame>
      <Card className="w-80">
        <CardHeader>
          <CardTitle>本月保养</CardTitle>
          <CardDescription>截至今天 18:00</CardDescription>
        </CardHeader>
        <CardContent className="text-copy-14">待保养 12 辆，其中 3 辆已超期。</CardContent>
        <CardFooter className="gap-2">
          <Button size="small">安排保养</Button>
          <Button size="small" variant="secondary">
            查看明细
          </Button>
        </CardFooter>
      </Card>
    </Frame>
  ),
};
