import type { Meta, StoryObj } from "@storybook/react";
import { BellIcon } from "lucide-react";
import { Avatar } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { CountBadge } from "../components/ui/count-badge";
import { Frame, describe } from "./frame";

const meta: Meta<typeof CountBadge> = {
  title: "Geist 组件/数据展示/CountBadge 徽标数",
  component: CountBadge,
  parameters: describe("叠在图标或头像右上角的计数（超过上限显示「99+」）或小红点；徽标本身 aria-hidden，数量写进被包住元素的可读名称里。Geist 的 Badge 是标签（见「Badge 标签」），计数徽标按 antd Badge 的能力用 Geist 色阶做。源码 src/components/ui/count-badge.tsx。", "badge"),
};
export default meta;
type Story = StoryObj<typeof CountBadge>;

export const Default: Story = {
  name: "计数与小红点",
  render: () => (
    <Frame className="gap-6">
      <CountBadge count={5}>
        <Button variant="secondary" svgOnly aria-label="通知，5 条未读">
          <BellIcon />
        </Button>
      </CountBadge>
      <CountBadge count={128}>
        <Button variant="secondary" svgOnly aria-label="待派订单，128 条">
          <BellIcon />
        </Button>
      </CountBadge>
      <CountBadge dot>
        <Avatar name="张伟" />
      </CountBadge>
      <CountBadge count={0} showZero tone="neutral">
        <Button variant="secondary" size="small">
          草稿
        </Button>
      </CountBadge>
    </Frame>
  ),
};
