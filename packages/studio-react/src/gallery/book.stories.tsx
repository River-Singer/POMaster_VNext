import type { Meta, StoryObj } from "@storybook/react";
import { BookOpenIcon, ShieldCheckIcon, TruckIcon } from "lucide-react";
import { Book } from "../components/ui/book";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Book> = {
  title: "Geist 组件/数据展示/Book 书封",
  component: Book,
  parameters: describe("文档、指南、手册的封面卡片：整张是指向那份文档的链接，悬停轻微翻开（减少动效时不动），颜色只取 Geist 色阶。Geist 有 Book；antd 没有对应组件。源码 src/components/ui/book.tsx。", "book"),
};
export default meta;
type Story = StoryObj<typeof Book>;

export const Default: Story = {
  name: "手册书架",
  render: () => (
    <Frame className="gap-6">
      <Book title="司机上岗手册" href="#driver-handbook" icon={<TruckIcon />} />
      <Book title="冷链运输规范" href="#cold-chain" tone="blue" icon={<ShieldCheckIcon />} />
      <Book title="调度员入门" href="#dispatcher" tone="green" icon={<BookOpenIcon />} width={128} />
    </Frame>
  ),
};
