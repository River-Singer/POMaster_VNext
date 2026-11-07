import type { Meta, StoryObj } from "@storybook/react";
import { Label } from "../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { Frame, describe } from "./frame";

const meta: Meta<typeof RadioGroup> = {
  title: "Geist 组件/数据录入/RadioGroup 单选组",
  component: RadioGroup,
  parameters: describe("Radix RadioGroup：方向键在选项间移动，组内只有一个 Tab 停留点。2–5 个互斥选项且要一眼看全时用。规则见「规范/组件/数据录入/单选」。源码 src/components/ui/radio-group.tsx。", "radio"),
};
export default meta;
type Story = StoryObj<typeof RadioGroup>;

export const Basic: Story = {
  name: "默认值与禁用项",
  render: () => (
    <Frame>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label-14">可见范围</legend>
        <RadioGroup defaultValue="self">
          <div className="flex items-center gap-2"><RadioGroupItem value="self" id="r-self" /><Label htmlFor="r-self">仅本人可见</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="team" id="r-team" /><Label htmlFor="r-team">本部门可见</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="all" id="r-all" disabled /><Label htmlFor="r-all">全公司可见（需管理员开通）</Label></div>
        </RadioGroup>
      </fieldset>
    </Frame>
  ),
};
