import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../components/ui/button";
import { Field, FieldControl } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Sheet> = {
  title: "Geist 组件/反馈/Sheet 侧边抽屉",
  component: Sheet,
  parameters: describe("从右侧滑入的抽屉（Radix Dialog）：查看或编辑详情而不离开列表；焦点进入并困在抽屉里，Esc 关闭，关闭后焦点回到触发按钮；滑入动效在「减少动效」时关闭。Geist 有 Sheet / Drawer。源码 src/components/ui/sheet.tsx。", "drawer"),
};
export default meta;
type Story = StoryObj<typeof Sheet>;

export const Default: Story = {
  name: "编辑详情",
  render: () => (
    <Frame>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="secondary">编辑车辆</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>编辑 沪A·D2391</SheetTitle>
            <SheetDescription>保存后立即生效。</SheetDescription>
          </SheetHeader>
          <Field label="司机">
            <FieldControl>
              <Input defaultValue="张伟" />
            </FieldControl>
          </Field>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="secondary">取消</Button>
            </SheetClose>
            <Button>保存</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Frame>
  ),
};
