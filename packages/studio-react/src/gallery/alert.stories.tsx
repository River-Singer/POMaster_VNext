import type { Meta, StoryObj } from "@storybook/react";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Column, describe } from "./frame";

const meta: Meta<typeof Alert> = {
  title: "Geist 组件/Alert 警告提示",
  component: Alert,
  parameters: describe("页面内的常驻提示：标题说清发生了什么，描述给出下一步。规则见「规范/组件/反馈/警告提示」。源码 src/components/ui/alert.tsx。"),
};
export default meta;
type Story = StoryObj<typeof Alert>;

export const Variants: Story = {
  name: "变体",
  render: () => (
    <Column className="max-w-xl">
      <Alert>
        <InfoIcon />
        <AlertTitle>车辆数据每天 02:00 同步</AlertTitle>
        <AlertDescription>同步期间列表可能短暂显示旧数据。</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>3 辆车保险将在 7 天内到期</AlertTitle>
        <AlertDescription>到期后车辆不能派单。到「保险管理」续保。</AlertDescription>
      </Alert>
    </Column>
  ),
};
