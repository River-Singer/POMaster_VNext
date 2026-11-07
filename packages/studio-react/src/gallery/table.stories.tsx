import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Table> = {
  title: "Geist 组件/Table 表格",
  component: Table,
  parameters: describe("表格骨架（原生 table 语义）：数字列右对齐并用等宽数字，状态用标签，行操作放最后一列。分页、排序、虚拟滚动由数据层负责（见「规范/设计模式/数据呈现/数据网格」）。源码 src/components/ui/table.tsx。"),
};
export default meta;
type Story = StoryObj<typeof Table>;

const ROWS = [
  { plate: "沪A12345", model: "轻型厢式货车", mileage: 12480, status: "在用" },
  { plate: "沪B20871", model: "中型栏板货车", mileage: 88213, status: "待年检" },
  { plate: "沪C99001", model: "冷藏车", mileage: 4302, status: "调度中" },
] as const;

export const Basic: Story = {
  name: "车辆列表",
  render: () => (
    <Frame>
      <Table className="w-[640px]">
        <TableCaption>共 3 辆车</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>车牌号</TableHead>
            <TableHead>车型</TableHead>
            <TableHead className="text-right">里程（km）</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ROWS.map((row) => (
            <TableRow key={row.plate}>
              <TableCell>{row.plate}</TableCell>
              <TableCell>{row.model}</TableCell>
              <TableCell className="text-right tabular-nums">{row.mileage.toLocaleString("zh-CN")}</TableCell>
              <TableCell>
                <Badge variant={row.status === "待年检" ? "outline" : "secondary"}>{row.status}</Badge>
              </TableCell>
              <TableCell>
                <Button size="small" variant="tertiary">
                  编辑
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Frame>
  ),
};
