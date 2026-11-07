import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Dialog> = {
  title: "Geist 组件/反馈/Dialog 对话框",
  component: Dialog,
  parameters: describe("Radix Dialog：打开时焦点进入、Tab 不出框、Esc 关闭、关闭后焦点回到触发按钮。标题写动作或问题，危险动作的主按钮用 error 变体，默认焦点在取消上。规则见「规范/组件/反馈/对话框」。源码 src/components/ui/dialog.tsx。", "modal"),
};
export default meta;
type Story = StoryObj<typeof Dialog>;

export const Confirm: Story = {
  name: "确认危险操作",
  render: () => (
    <Frame>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="error">删除选中车辆</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-96">
          <DialogHeader>
            <DialogTitle>删除 3 辆车？</DialogTitle>
            <DialogDescription>删除后车辆的历史工单仍保留，但不能再派单。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">取消</Button>
            </DialogClose>
            <Button variant="error">删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Frame>
  ),
};

export const Form: Story = {
  name: "简短表单",
  render: () => (
    <Frame>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="secondary">修改车牌号</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-96">
          <DialogHeader>
            <DialogTitle>修改 沪A12345 的车牌号</DialogTitle>
            <DialogDescription>换牌后历史记录仍挂在这辆车上。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-plate">新车牌号</Label>
            <Input id="new-plate" placeholder="例：沪A54321" />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">取消</Button>
            </DialogClose>
            <Button>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Frame>
  ),
};
