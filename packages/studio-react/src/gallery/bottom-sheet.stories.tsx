import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Sheet> = {
  title: "Geist 组件/反馈/BottomSheet 底部抽屉",
  component: Sheet,
  parameters: describe("移动端的底部抽屉：SheetContent side=\"bottom\"，顶部有把手，最高 85% 视口，内容多时内部滚动；用于移动端的操作菜单与短表单。Geist 的 Drawer 在小屏是底部抽屉。源码 src/components/ui/sheet.tsx。", "bottom_sheet"),
};
export default meta;
type Story = StoryObj<typeof Sheet>;

export const Default: Story = {
  name: "操作菜单",
  render: () => (
    <Frame>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="secondary">订单操作</Button>
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>ORD-20261107-0042</SheetTitle>
            <SheetDescription>选择要对这个订单做的操作。</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2">
            <Button variant="secondary">联系收货人</Button>
            <Button variant="secondary">上报异常</Button>
            <SheetClose asChild>
              <Button variant="tertiary">取消</Button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </Frame>
  ),
};
