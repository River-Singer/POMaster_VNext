import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Banner } from "../components/ui/banner";
import { Button } from "../components/ui/button";
import { Column, describe } from "./frame";

const meta: Meta<typeof Banner> = {
  title: "Geist 组件/反馈/Banner 横幅",
  component: Banner,
  parameters: describe("贴着顶部导航的整宽系统消息（维护公告、试用到期、服务降级）：一次只显示一条；要处理的给出动作链接；可关闭时关闭按钮有名称。区块内的提示用 Alert。源码 src/components/ui/banner.tsx。", "banner"),
};
export default meta;
type Story = StoryObj<typeof Banner>;

function Demo() {
  const [shown, setShown] = React.useState(true);
  return (
    <Column className="w-full gap-4 p-0">
      {shown ? (
        <Banner onDismiss={() => setShown(false)} action={<a href="#notice">查看公告</a>}>
          11 月 9 日 02:00–04:00 系统维护，期间不能派单。
        </Banner>
      ) : (
        <Button variant="tertiary" size="small" className="ml-6" onClick={() => setShown(true)}>重新显示横幅</Button>
      )}
      <Banner tone="warning" action={<a href="#billing">去续费</a>}>试用还剩 3 天，到期后车辆定位将停止更新。</Banner>
      <Banner tone="error">定位服务异常，车辆位置可能延迟 5 分钟以上。</Banner>
    </Column>
  );
}

export const Default: Story = { name: "三种语气", render: () => <Demo /> };
