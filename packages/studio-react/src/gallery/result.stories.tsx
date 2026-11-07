import type { Meta, StoryObj } from "@storybook/react";
import { Button, ButtonLink } from "../components/ui/button";
import { Result } from "../components/ui/result";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Result> = {
  title: "Geist 组件/反馈/Result 结果与错误",
  component: Result,
  parameters: describe("操作结束或整页不可用时的结果页：图标 + 标题说清发生了什么 + 下一步 + 动作；错误页给出可报告的请求编号，不暴露堆栈。Geist 的 Error 页面模式 + antd Result 的状态集合。源码 src/components/ui/result.tsx。", "result"),
};
export default meta;
type Story = StoryObj<typeof Result>;

export const Default: Story = {
  name: "成功、无权限、不存在、出错",
  render: () => (
    <Frame className="grid grid-cols-2 items-start gap-4">
      <Result status="success" title="车辆已提交审核" description="审核一般在 1 个工作日内完成，结果会通知你。" actions={<><ButtonLink href="#vehicles" variant="secondary">返回列表</ButtonLink><Button>继续添加</Button></>} />
      <Result status="403" title="没有查看这个车队的权限" description="请联系车队管理员开通。" actions={<ButtonLink href="#home" variant="secondary">回到首页</ButtonLink>} />
      <Result status="404" title="找不到这辆车" description="它可能已被删除，或者链接有误。" actions={<ButtonLink href="#vehicles" variant="secondary">返回车辆列表</ButtonLink>} />
      <Result status="500" title="加载失败" description="服务暂时不可用，稍后重试。" requestId="req_7c1e9a4b" actions={<Button variant="secondary">重试</Button>} />
    </Frame>
  ),
};
