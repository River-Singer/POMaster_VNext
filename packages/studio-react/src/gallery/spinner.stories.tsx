import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Button } from "../components/ui/button";
import { LoadingDots, LoadingOverlay, Spinner } from "../components/ui/spinner";
import { Column, describe } from "./frame";

const meta: Meta<typeof Spinner> = {
  title: "Geist 组件/反馈/Spinner 加载中",
  component: Spinner,
  parameters: describe("加载指示：Spinner 用于按钮内与小区域，LoadingDots 用于行内文字，都带 role=\"status\" 与可读文字；LoadingOverlay 包住已有内容，加载时盖遮罩、内容 aria-busy 且不可交互，不足 300ms 的加载不显示。整页首次加载用 Skeleton。Geist 有 Spinner / Loading Dots。源码 src/components/ui/spinner.tsx。", "spin"),
};
export default meta;
type Story = StoryObj<typeof Spinner>;

function Demo() {
  const [loading, setLoading] = React.useState(false);
  return (
    <Column>
      <div className="flex items-center gap-4">
        <Spinner />
        <Spinner size={24} />
        <Spinner size={32} label="正在加载车辆" />
        <span className="text-copy-14">正在计算路线<LoadingDots className="ml-1" /></span>
      </div>
      <LoadingOverlay loading={loading} className="w-80 rounded-lg border border-ds-gray-400 p-4">
        <p className="text-label-14">本周订单 12,846 单</p>
        <p className="text-copy-13 text-ds-gray-900">数据每 5 分钟刷新一次。</p>
      </LoadingOverlay>
      <Button
        variant="secondary"
        size="small"
        onClick={() => {
          setLoading(true);
          window.setTimeout(() => setLoading(false), 1500);
        }}
      >
        刷新数据
      </Button>
    </Column>
  );
}

export const Default: Story = { name: "三种形态", render: () => <Demo /> };
