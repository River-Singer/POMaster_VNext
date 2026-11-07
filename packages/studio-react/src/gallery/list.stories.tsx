import type { Meta, StoryObj } from "@storybook/react";
import { EllipsisIcon } from "lucide-react";
import { Avatar } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { List, ListItem } from "../components/ui/list";
import { StatusDot } from "../components/ui/status-dot";
import { Column, describe } from "./frame";

const meta: Meta<typeof List> = {
  title: "Geist 组件/数据展示/List 列表",
  component: List,
  parameters: describe("实体列表（Geist Entity）：每行「头像或图标 + 标题 + 描述 + 元信息 + 操作」；整行可点时只有标题是链接（点击区扩展到整行），行内按钮仍单独可聚焦。数据多、需要排序筛选时用 Table。源码 src/components/ui/list.tsx。", "list"),
};
export default meta;
type Story = StoryObj<typeof List>;

const drivers = [
  { name: "张伟", plate: "沪A·D2391", state: "building" as const, label: "在途", trips: 128 },
  { name: "李娜", plate: "沪A·D2392", state: "ready" as const, label: "空闲", trips: 96 },
  { name: "王芳", plate: "沪A·D2395", state: "error" as const, label: "故障", trips: 77 },
];

export const Default: Story = {
  name: "司机列表",
  render: () => (
    <Column className="w-full max-w-xl">
      <List className="w-full">
        {drivers.map((d) => (
          <ListItem
            key={d.name}
            href={`#driver-${d.plate}`}
            leading={<Avatar name={d.name} decorative />}
            title={d.name}
            description={<StatusDot state={d.state} label={`${d.plate} · ${d.label}`} />}
            meta={`${d.trips} 单`}
            actions={
              <Button size="small" variant="tertiary" svgOnly aria-label={`${d.name} 的更多操作`}>
                <EllipsisIcon />
              </Button>
            }
          />
        ))}
      </List>
    </Column>
  ),
};
