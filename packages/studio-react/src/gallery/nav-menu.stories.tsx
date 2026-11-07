import type { Meta, StoryObj } from "@storybook/react";
import { CarIcon, LayoutDashboardIcon, SettingsIcon, UsersIcon, WrenchIcon } from "lucide-react";
import { NavMenu } from "../components/ui/nav-menu";
import { Frame, describe } from "./frame";

const meta: Meta<typeof NavMenu> = {
  title: "Geist 组件/导航/NavMenu 导航菜单",
  component: NavMenu,
  parameters: describe("侧栏导航：分组、可展开的二级菜单（按钮带 aria-expanded）、当前页 aria-current=\"page\"；收起时只显示图标并保留可读名称。导航用链接，不用按钮跳转。源码 src/components/ui/nav-menu.tsx。", "nav_menu"),
};
export default meta;
type Story = StoryObj<typeof NavMenu>;

const groups = [
  { items: [{ key: "overview", label: "概览", icon: <LayoutDashboardIcon />, href: "#overview" }] },
  {
    label: "车队",
    items: [
      { key: "vehicles", label: "车辆", icon: <CarIcon />, children: [{ key: "vehicle-list", label: "车辆列表", href: "#list" }, { key: "maintenance", label: "保养记录", href: "#maint" }] },
      { key: "drivers", label: "司机", icon: <UsersIcon />, href: "#drivers", badge: "3" },
      { key: "repair", label: "维修", icon: <WrenchIcon />, href: "#repair" },
    ],
  },
  { label: "系统", items: [{ key: "settings", label: "设置", icon: <SettingsIcon />, href: "#settings" }] },
];

export const Default: Story = {
  name: "展开与收起",
  render: () => (
    <Frame className="items-start">
      <div className="w-60 rounded-lg border border-ds-gray-400 p-2">
        <NavMenu groups={groups} current="vehicle-list" defaultOpen={["vehicles"]} />
      </div>
      <div className="w-12 rounded-lg border border-ds-gray-400 p-1">
        <NavMenu groups={groups} current="drivers" collapsed />
      </div>
    </Frame>
  ),
};
