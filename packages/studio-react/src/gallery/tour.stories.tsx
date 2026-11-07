import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Button } from "../components/ui/button";
import { SearchInput } from "../components/ui/search-input";
import { TOUR_TARGET_CLASS, Tour } from "../components/ui/tour";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Tour> = {
  title: "Geist 组件/数据展示/Tour 漫游引导",
  component: Tour,
  parameters: describe("新功能的分步引导：每步一个气泡锚定到目标元素（Radix Popover 的虚拟锚点），目标加焦点环；上一步 / 下一步 / 跳过，显示「2 / 3」，Esc 随时退出；只在用户第一次遇到时出现一次。Geist 没有 Tour，按 antd Tour 的能力用 Geist 的弹层做。源码 src/components/ui/tour.tsx。", "tour"),
};
export default meta;
type Story = StoryObj<typeof Tour>;

function Demo() {
  const [open, setOpen] = React.useState(false);
  const search = React.useRef<HTMLDivElement>(null);
  const create = React.useRef<HTMLButtonElement>(null);
  const exportRef = React.useRef<HTMLButtonElement>(null);
  return (
    <Frame className="flex-col items-start">
      <div className="flex items-center gap-3">
        <div ref={search} className={TOUR_TARGET_CLASS}>
          <SearchInput aria-label="搜索车辆" placeholder="车牌号或司机" />
        </div>
        <Button ref={create} className={TOUR_TARGET_CLASS}>新建车辆</Button>
        <Button ref={exportRef} variant="secondary" className={TOUR_TARGET_CLASS}>导出</Button>
      </div>
      <Button variant="tertiary" size="small" onClick={() => setOpen(true)}>开始引导</Button>
      <Tour
        open={open}
        onOpenChange={setOpen}
        steps={[
          { target: () => search.current, title: "搜索车辆", description: "车牌号、司机姓名都能搜。" },
          { target: () => create.current, title: "新建车辆", description: "录入车辆后就可以派单。" },
          { target: () => exportRef.current, title: "导出", description: "按当前筛选导出 Excel。" },
        ]}
      />
    </Frame>
  );
}

export const Default: Story = { name: "三步引导", render: () => <Demo /> };
