import type { Meta, StoryObj } from "@storybook/react";
import { CarIcon, LayoutDashboardIcon, UsersIcon } from "lucide-react";
import { NavMenu } from "../components/ui/nav-menu";
import { PageLayout } from "../components/ui/page-layout";
import { Frame, describe } from "./frame";

const meta: Meta<typeof PageLayout> = {
  title: "Geist 组件/布局/PageLayout 页面布局",
  component: PageLayout,
  parameters: describe("后台页面骨架：顶栏（品牌 + 侧栏开关 + 右侧工具）+ 可收起的侧栏导航 + 内容区；收起状态由按钮的 aria-expanded 报告。演示用 contained 放在固定高度的框里。源码 src/components/ui/page-layout.tsx。", "page_layout"),
};
export default meta;
type Story = StoryObj<typeof PageLayout>;

export const Default: Story = {
  name: "顶栏 + 侧栏 + 内容",
  render: () => (
    <Frame className="h-96 p-0">
      <PageLayout
        contained
        className="w-full"
        brand={<span className="text-label-14">车队调度</span>}
        header={<span className="text-copy-13 text-ds-gray-900">张调度</span>}
        sidebar={
          <NavMenu
            current="vehicles"
            groups={[{ items: [
              { key: "overview", label: "概览", icon: <LayoutDashboardIcon />, href: "#overview" },
              { key: "vehicles", label: "车辆", icon: <CarIcon />, href: "#vehicles" },
              { key: "drivers", label: "司机", icon: <UsersIcon />, href: "#drivers" },
            ] }]}
          />
        }
      >
        <div className="p-6 text-copy-14">车辆列表放在这里。</div>
      </PageLayout>
    </Frame>
  ),
};
