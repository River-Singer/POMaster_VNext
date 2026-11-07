import type { Meta, StoryObj } from "@storybook/react";
import { ArrowRightIcon, CopyIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { Button, ButtonLink } from "../components/ui/button";
import { Caption, Column, Frame, describe } from "./frame";

const meta: Meta<typeof Button> = {
  title: "Geist 组件/Button 按钮",
  component: Button,
  parameters: describe("Geist 的按钮：五种变体、四档尺寸；纯图标按钮设 svgOnly 并带 aria-label；loading 时保持可聚焦并报告忙碌。规则见「规范/组件/通用/按钮」。源码 src/components/ui/button.tsx。"),
  argTypes: {
    variant: { control: "select", options: ["default", "secondary", "tertiary", "error", "warning"] },
    size: { control: "select", options: ["tiny", "small", "medium", "large"] },
    shape: { control: "select", options: ["square", "rounded"] },
    loading: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  args: { variant: "default", size: "medium", shape: "square", loading: false, disabled: false, children: "新建车辆" },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Playground: Story = {
  name: "实验场",
  render: (args) => (
    <Frame>
      <Button {...args} />
    </Frame>
  ),
};

export const Variants: Story = {
  name: "变体",
  render: () => (
    <Frame>
      <Button>保存</Button>
      <Button variant="secondary">取消</Button>
      <Button variant="tertiary">重置筛选</Button>
      <Button variant="error">删除车辆</Button>
      <Button variant="warning">停用账号</Button>
    </Frame>
  ),
};

export const Sizes: Story = {
  name: "尺寸",
  render: () => (
    <Column>
      {(["tiny", "small", "medium", "large"] as const).map((size) => (
        <div key={size} className="flex items-center gap-3">
          <Caption>{size}</Caption>
          <Button size={size}>保存</Button>
          <Button size={size} variant="secondary" prefix={<PlusIcon />}>
            新建
          </Button>
        </div>
      ))}
    </Column>
  ),
};

export const Icons: Story = {
  name: "图标与形状",
  render: () => (
    <Frame>
      <Button prefix={<PlusIcon />}>新建车辆</Button>
      <Button variant="secondary" suffix={<ArrowRightIcon />}>
        下一步
      </Button>
      <Button variant="secondary" svgOnly aria-label="刷新车辆列表">
        <RefreshCwIcon />
      </Button>
      <Button variant="tertiary" shape="circle" svgOnly aria-label="复制车牌号">
        <CopyIcon />
      </Button>
      <Button shape="rounded">圆角按钮</Button>
    </Frame>
  ),
};

export const States: Story = {
  name: "加载与禁用",
  render: () => (
    <Frame>
      <Button loading>保存中</Button>
      <Button variant="secondary" loading>
        导出中
      </Button>
      <Button disabled>保存</Button>
      <Button variant="secondary" disabled>
        取消
      </Button>
    </Frame>
  ),
};

export const Link: Story = {
  name: "链接按钮",
  render: () => (
    <Frame>
      <ButtonLink href="#vehicles" variant="secondary">
        查看车辆台账
      </ButtonLink>
      <ButtonLink href="#help" variant="tertiary" suffix={<ArrowRightIcon />}>
        使用说明
      </ButtonLink>
    </Frame>
  ),
};
